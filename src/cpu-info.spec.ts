import { getCpuInfo } from './cpu-info';

describe('getCpuInfo', () => {
  it('should get correct CPU information when available', () => {
    expect.assertions(1);

    jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockReturnValue(1);

    const cpuInfo = getCpuInfo();
    expect(cpuInfo.numLogicalCores).toBe(1);
  });
  it('should get correct CPU information when not available', () => {
    expect.assertions(1);

    jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockImplementation();

    const cpuInfo = getCpuInfo();
    expect(cpuInfo.numLogicalCores).toBeUndefined();
  });
});
