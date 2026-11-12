import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { IfcAPI } from 'web-ifc';
import { Box3, BufferAttribute, BufferGeometry, Matrix4, Mesh, Vector3 } from 'three';
import { convertIfc } from '../src/ifc-model.js';

test('the real IFC engine preserves dimensions, relative placement and colours', async () => {
  const api = new IfcAPI();
  await api.Init();
  const bytes = await readFile(new URL('./fixtures/blocks.ifc', import.meta.url));
  try {
    const result = convertIfc(api, bytes);
    assert.equal(result.version, 'IFC4');
    assert.equal(result.stats.elementCount, 2);
    assert.equal(result.stats.triangleCount, 24);
    const boxes = result.meshes.map(({ positions, indices, normals, transform }) => {
      assert.ok(positions.every(Number.isFinite));
      assert.equal(normals.length, positions.length);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setIndex(new BufferAttribute(indices, 1));
      const mesh = new Mesh(geometry);
      mesh.applyMatrix4(new Matrix4().fromArray(transform));
      const box = new Box3().setFromObject(mesh);
      geometry.dispose();
      return box;
    });
    assert.equal(boxes.length, 2);
    for (const box of boxes) {
      const dimensions = box.getSize(new Vector3()).toArray();
      for (const [i, expected] of [2, 4, 3].entries())
        assert.ok(Math.abs(dimensions[i] - expected) < 0.00001);
    }
    const separation = boxes[1].getCenter(new Vector3()).sub(boxes[0].getCenter(new Vector3()));
    assert.ok(separation.distanceTo(new Vector3(5, 0, 0)) < 0.00001);
    const rgba = result.materials[0].baseColor;
    for (const [i, expected] of [0.2, 0.4, 0.6, 1].entries())
      assert.ok(Math.abs(rgba[i] - expected) < 0.00001);
    assert.equal(api.IsModelOpen(0), false);
    // A second parse proves model cleanup does not leave the engine unusable.
    assert.equal(convertIfc(api, bytes).stats.elementCount, 2);
    assert.throws(() => convertIfc(api, new TextEncoder().encode('not an IFC')), /not an IFC/);
  } finally {
    api.Dispose();
  }
});
