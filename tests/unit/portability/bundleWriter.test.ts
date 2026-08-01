import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BundleWriter } from '../../../server/services/portability/bundleWriter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('BundleWriter (IEX2-9)', () => {
  let writer: BundleWriter;
  let tmpDir: string;
  let outPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezb-test-'));
    outPath = path.join(tmpDir, 'test-bundle.zip');
    writer = new BundleWriter(outPath);
  });

  afterEach(() => {
    writer.cleanup();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('rejects with stream error during writeEntityRow backpressure path (AC 1)', async () => {
    // Trigger creation of the stream
    await writer.writeEntityRow('steps', { id: 0 });
    const stream = (writer as any).entityStreams.get('steps');
    
    const originalWrite = stream.write.bind(stream);
    stream.write = (chunk: any, encoding?: any, cb?: any) => {
      originalWrite(chunk, encoding, cb);
      return false; // Force backpressure
    };

    const writePromise = writer.writeEntityRow('steps', { id: 1 });
    
    setTimeout(() => {
      stream.emit('error', new Error('Simulated disk error'));
    }, 10);

    await expect(writePromise).rejects.toThrow('Simulated disk error');
    
    await expect(writer.writeEntityRow('steps', { id: 2 })).rejects.toThrow('Simulated disk error');
    await expect(writer.finalize()).rejects.toThrow('Simulated disk error');
  });

  it('rejects with stream error during writeEntityRow non-backpressure path (AC 2)', async () => {
    await writer.writeEntityRow('steps', { id: 0 });
    const stream = (writer as any).entityStreams.get('steps');

    stream.emit('error', new Error('Simulated non-backpressure error'));

    await expect(writer.writeEntityRow('steps', { id: 2 })).rejects.toThrow('Simulated non-backpressure error');
    await expect(writer.finalize()).rejects.toThrow('Simulated non-backpressure error');
  });

  it('does not accumulate listeners on the backpressure path (AC 3)', async () => {
    await writer.writeEntityRow('steps', { id: 0 });
    const stream = (writer as any).entityStreams.get('steps');
    
    const originalWrite = stream.write.bind(stream);
    stream.write = (chunk: any, encoding?: any, cb?: any) => {
      originalWrite(chunk, encoding, cb);
      process.nextTick(() => stream.emit('drain'));
      return false;
    };

    for (let i = 1; i <= 50; i++) {
      await writer.writeEntityRow('steps', { id: i });
    }

    const drainListeners = stream.listenerCount('drain');
    const errorListeners = stream.listenerCount('error');

    // Should only have the one persistent error listener
    expect(drainListeners).toBe(0);
    expect(errorListeners).toBe(1);
  });
});
