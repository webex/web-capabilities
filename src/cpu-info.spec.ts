import { CpuInfo } from './cpu-info';

describe('CpuInfo', () => {
  it('should return the number of logical cores when it is available', () => {
    expect.assertions(1);

    jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockReturnValue(1);

    expect(CpuInfo.getNumLogicalCores()).toBe(1);
  });

  it('should return undefined when the logical cores it is not available', () => {
    expect.assertions(1);

    jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockImplementation();

    expect(CpuInfo.getNumLogicalCores()).toBeUndefined();
  });
});
