import { describe, expect, it, vi } from 'vitest';

import { getTemplateFilePath } from '../../../server/services/templateFiles';

describe('getTemplateFilePath', () => {
  it('delegates local-path resolution to a non-disk storage provider', async () => {
    const provider = {
      getLocalPath: vi.fn().mockResolvedValue('C:\\temp\\remote-template.docx'),
    };

    await expect(getTemplateFilePath('templates/remote.docx', provider)).resolves.toBe(
      'C:\\temp\\remote-template.docx'
    );
    expect(provider.getLocalPath).toHaveBeenCalledWith('templates/remote.docx');
  });
});
