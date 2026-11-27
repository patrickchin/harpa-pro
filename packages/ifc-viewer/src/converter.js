import { IfcAPI } from 'web-ifc';
import { convertIfc } from './ifc-model.js';

const api = new IfcAPI();
const initialized = api.Init((file) => new URL(file, import.meta.url).href, true);
initialized.then(
  () => self.postMessage({ type: 'ready' }),
  () =>
    self.postMessage({
      type: 'error',
      message: 'The local IFC engine could not load. Reload this page and try again.',
    }),
);

self.onmessage = async ({ data }) => {
  try {
    await initialized;
    const result = convertIfc(api, data.buffer, (ratio, message) =>
      self.postMessage({ type: 'progress', ratio, message }),
    );
    const buffers = [
      ...new Set(
        result.meshes.flatMap(({ positions, normals, indices }) => [
          positions.buffer,
          normals.buffer,
          indices.buffer,
        ]),
      ),
    ];
    self.postMessage({ type: 'result', ...result }, buffers);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
