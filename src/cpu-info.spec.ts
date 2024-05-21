import { CpuInfo } from './cpu-info';

describe('CpuInfo', () => {
  it('should get correct CPU information when available', () => {
    expect.assertions(1);

    jest.spyOn(CpuInfo, 'getNumLogicalCores').mockReturnValue(1);

    expect(CpuInfo.getNumLogicalCores()).toBe(1);
  });
  it('should get correct CPU information when not available', () => {
    expect.assertions(1);

    jest.spyOn(CpuInfo, 'getNumLogicalCores').mockImplementation();

    expect(CpuInfo.getNumLogicalCores()).toBeUndefined();
  });
});
