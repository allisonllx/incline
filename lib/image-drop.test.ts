import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolveImageDrop, fetchDroppedImage } from './image-drop.ts';

void test('a browser image URL is accepted when the drag contains no files', () => {
  assert.deepEqual(
    resolveImageDrop({
      files: [],
      uriList: '# dragged image\r\nhttps://example.com/photo.png\r\n',
    }),
    { kind: 'url', url: 'https://example.com/photo.png' },
  );
  assert.deepEqual(
    resolveImageDrop({ files: [], text: 'https://example.com/photo?id=1' }),
    { kind: 'url', url: 'https://example.com/photo?id=1' },
  );
});

void test('the image source takes precedence over its enclosing link, and files take precedence over URLs', () => {
  assert.deepEqual(
    resolveImageDrop({
      files: [],
      imageUrl: 'https://images.example.com/photo.webp',
      uriList: 'https://example.com/article',
    }),
    { kind: 'url', url: 'https://images.example.com/photo.webp' },
  );
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  const result = resolveImageDrop({
    files: [file],
    imageUrl: 'https://example.com/photo.png',
  });
  assert.equal(result.kind, 'files');
  if (result.kind === 'files') assert.equal(result.files[0], file);
});

void test('empty, unsafe, and ambiguous drops fail visibly instead of pretending to upload', () => {
  for (const input of [
    { files: [] },
    { files: [], text: 'ordinary text' },
    { files: [], imageUrl: 'javascript:alert(1)' },
    { files: [], imageUrl: 'blob:https://example.com/private' },
    { files: [], imageUrl: 'file:///private/image.png' },
    { files: [], imageUrl: 'https://user:password@example.com/photo.png' },
    {
      files: [],
      uriList: 'https://example.com/one.png\nhttps://example.com/two.png',
    },
  ])
    assert.throws(() => resolveImageDrop(input), /image|file|one at a time/i);
});

void test('embedded raster image drops work but SVG data is rejected', async () => {
  const url = 'data:image/png;base64,iVBORw0KGgo=';
  assert.deepEqual(resolveImageDrop({ files: [], imageUrl: url }), {
    kind: 'url',
    url,
  });
  const file = await fetchDroppedImage(url);
  assert.equal(file.type, 'image/png');
  assert.deepEqual(
    Buffer.from(await file.arrayBuffer()),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.throws(
    () =>
      resolveImageDrop({ files: [], imageUrl: 'data:image/svg+xml,<svg/>' }),
    /image|file/i,
  );
});

void test('web-image retrieval preserves bytes and reports inaccessible, non-image, empty and oversized responses', async (t) => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const server = createServer((request, response) => {
    if (request.url === '/missing') {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (request.url === '/page') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html>not an image</html>');
      return;
    }
    if (request.url === '/large') {
      response.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': '8000001',
      });
      response.end();
      return;
    }
    if (request.url === '/stream') {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end(Buffer.alloc(8000001));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(request.url === '/empty' ? undefined : bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const image = await fetchDroppedImage(base + '/reference.png');
  assert.equal(image.name, 'reference.png');
  assert.equal(image.type, 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  await assert.rejects(
    fetchDroppedImage(base + '/missing'),
    /save|choose|drop.*file/i,
  );
  await assert.rejects(fetchDroppedImage(base + '/page'), /image|file/i);
  await assert.rejects(fetchDroppedImage(base + '/empty'), /empty|image|file/i);
  await assert.rejects(fetchDroppedImage(base + '/large'), /8 MB/i);
  await assert.rejects(fetchDroppedImage(base + '/stream'), /8 MB/i);
});
