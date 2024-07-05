import { windowInfo } from './window-info';

describe('windowInfo', () => {
  it('returns the correct screen width and height when accessed', () => {
    expect.hasAssertions();

    jest.spyOn(window.screen, 'width', 'get').mockReturnValue(1280);
    jest.spyOn(window.screen, 'height', 'get').mockReturnValue(720);

    expect(windowInfo.getScreenWidth()).toBe(1280);
    expect(windowInfo.getScreenHeight()).toBe(720);
  });
  it('returns undefined for screen width and height when the properties are not defined', () => {
    expect.hasAssertions();

    jest.spyOn(window.screen, 'height', 'get').mockImplementation();
    jest.spyOn(window.screen, 'width', 'get').mockImplementation();

    expect(windowInfo.getScreenWidth()).toBeUndefined();
    expect(windowInfo.getScreenHeight()).toBeUndefined();
  });
  it('returns the correct window width and height when accessed', () => {
    expect.hasAssertions();

    Object.defineProperty(window, 'innerWidth', {
      value: 1080,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 480,
    });

    expect(windowInfo.getWindowWidth()).toBe(1080);
    expect(windowInfo.getWindowHeight()).toBe(480);
  });
  it('returns undefined for window width and height when the properties are not defined', () => {
    expect.hasAssertions();

    Object.defineProperty(window, 'innerWidth', {
      value: undefined,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: undefined,
    });

    expect(windowInfo.getWindowWidth()).toBeUndefined();
    expect(windowInfo.getWindowHeight()).toBeUndefined();
  });
});
