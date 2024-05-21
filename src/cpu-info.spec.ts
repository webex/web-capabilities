import { CpuInfo } from './cpu-info';

describe('CpuInfo', () => {
  it('should get correct CPU information when available', () => {
    expect.assertions(1);

    jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockReturnValue(1);

    expect(CpuInfo.getNumLogicalCores()).toBe(1);
  });
  it('should get correct CPU information when not available', () => {
    expect.assertions(1);

    jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockImplementation();

    expect(CpuInfo.getNumLogicalCores()).toBeUndefined();
  });
});
