import Bowser from 'bowser';
import { BrowserInfo, BrowserName } from './browser-info';

/**
 * Given a browser name, mock a specific user agent.
 *
 * @param browserName - The name of the browser to mock.
 */
const mockUserAgent = (browserName: BrowserName): void => {
  let userAgent;
  switch (browserName) {
    case BrowserName.CHROME:
      userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';
      break;
    case BrowserName.FIREFOX:
      userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0';
      break;
    case BrowserName.EDGE:
      userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.60';
      break;
    case BrowserName.SAFARI:
      userAgent =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      break;
    default:
      throw new Error(`Unknown browser name ${browserName}`);
  }
  // eslint-disable-next-line dot-notation
  BrowserInfo['browser'] = Bowser.getParser(userAgent);
};

describe('BrowserInfo', () => {
  describe('getting details', () => {
    it('should get browser details correctly', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.CHROME);

      expect(BrowserInfo.getBrowserDetails().name).toBe(BrowserName.CHROME);
      expect(BrowserInfo.getBrowserDetails().version).toBe('118.0.0.0');
    });

    it('should get OS details correctly', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.CHROME);

      expect(BrowserInfo.getOSDetails().name).toBe('Windows');
      expect(BrowserInfo.getOSDetails().version).toBe('NT 10.0');
      expect(BrowserInfo.getOSDetails().versionName).toBe('10');
    });

    it('should get platform details correctly', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.CHROME);

      expect(BrowserInfo.getPlatformDetails().type).toBe('desktop');
    });

    it('should get engine details correctly', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.CHROME);

      expect(BrowserInfo.getEngineDetails().name).toBe('Blink');
    });
  });

  describe('identifying browsers', () => {
    it('should identify a Chrome browser', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.CHROME);

      expect(BrowserInfo.isChrome()).toBeTruthy();
      expect(BrowserInfo.isFirefox()).toBeFalsy();
      expect(BrowserInfo.isEdge()).toBeFalsy();
      expect(BrowserInfo.isSafari()).toBeFalsy();
    });

    it('should identify a Firefox browser', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.FIREFOX);

      expect(BrowserInfo.isChrome()).toBeFalsy();
      expect(BrowserInfo.isFirefox()).toBeTruthy();
      expect(BrowserInfo.isEdge()).toBeFalsy();
      expect(BrowserInfo.isSafari()).toBeFalsy();
    });

    it('should identify a Edge browser', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.EDGE);

      expect(BrowserInfo.isChrome()).toBeFalsy();
      expect(BrowserInfo.isFirefox()).toBeFalsy();
      expect(BrowserInfo.isEdge()).toBeTruthy();
      expect(BrowserInfo.isSafari()).toBeFalsy();
    });

    it('should identify a Safari browser', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.SAFARI);

      expect(BrowserInfo.isChrome()).toBeFalsy();
      expect(BrowserInfo.isFirefox()).toBeFalsy();
      expect(BrowserInfo.isEdge()).toBeFalsy();
      expect(BrowserInfo.isSafari()).toBeTruthy();
    });
  });

  describe('comparing versions', () => {
    it('should compare browser versions correctly', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.CHROME);

      expect(BrowserInfo.isVersionGreaterThan('117')).toBeTruthy();
      expect(BrowserInfo.isVersionGreaterThanOrEqualTo('117')).toBeTruthy();
      expect(BrowserInfo.isVersionGreaterThanOrEqualTo('118')).toBeTruthy();

      expect(BrowserInfo.isVersionLessThan('119')).toBeTruthy();
      expect(BrowserInfo.isVersionLessThanOrEqualTo('119')).toBeTruthy();
      expect(BrowserInfo.isVersionLessThanOrEqualTo('118')).toBeTruthy();
    });

    it('should get browser sub-version correctly', () => {
      expect.hasAssertions();
      mockUserAgent(BrowserName.CHROME);

      expect(BrowserInfo.isSubVersionOf('118')).toBeTruthy();
    });
  });
});
