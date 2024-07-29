import Bowser from 'bowser';

/**
 * Used by the {@link BrowserInfo} class to check the name of the browser.
 */
export enum BrowserName {
  CHROME = 'Chrome',
  FIREFOX = 'Firefox',
  EDGE = 'Microsoft Edge',
  SAFARI = 'Safari',
}

/**
 * Used by the {@link BrowserInfo} class to check the name of the OS.
 */
export enum OSName {
  WINDOWS = 'Windows',
  MAC = 'macOS',
  LINUX = 'Linux',
}

/**
 * A class that retrieves and checks certain information about the browser.
 */
export class BrowserInfo {
  private static browser = Bowser.getParser(window.navigator.userAgent);

  /**
   * Get details about the browser, including name and version.
   *
   * @returns Browser details.
   */
  static getBrowserDetails(): Bowser.Parser.BrowserDetails {
    return this.browser.getBrowser();
  }

  /**
   * Get details about the OS, including name, version, and version name.
   *
   * @returns OS details.
   */
  static getOSDetails(): Bowser.Parser.OSDetails {
    return this.browser.getOS();
  }

  /**
   * Get details about the platform, including type, vendor, and model.
   *
   * @returns Platform details.
   */
  static getPlatformDetails(): Bowser.Parser.PlatformDetails {
    return this.browser.getPlatform();
  }

  /**
   * Get details about the engine, including name and version.
   *
   * @returns Engine details.
   */
  static getEngineDetails(): Bowser.Parser.EngineDetails {
    return this.browser.getEngine();
  }

  /**
   * Check if current browser is Chrome.
   *
   * @returns True if Chrome, false otherwise.
   */
  static isChrome(): boolean {
    return this.browser.getBrowserName() === BrowserName.CHROME;
  }

  /**
   * Check if current browser is Firefox.
   *
   * @returns True if Firefox, false otherwise.
   */
  static isFirefox(): boolean {
    return this.browser.getBrowserName() === BrowserName.FIREFOX;
  }

  /**
   * Check if current browser is Edge.
   *
   * @returns True if Edge, false otherwise.
   */
  static isEdge(): boolean {
    return this.browser.getBrowserName() === BrowserName.EDGE;
  }

  /**
   * Check if current browser is Safari.
   *
   * @returns True if Safari, false otherwise.
   */
  static isSafari(): boolean {
    return this.browser.getBrowserName() === BrowserName.SAFARI;
  }

  /**
   * Check if current OS is Windows.
   *
   * @returns True if Windows, false otherwise.
   */
  static isWindows(): boolean {
    return this.browser.getOSName() === OSName.WINDOWS;
  }

  /**
   * Check if current OS is Mac.
   *
   * @returns True if Mac, false otherwise.
   */
  static isMac(): boolean {
    return this.browser.getOSName() === OSName.MAC;
  }

  /**
   * Check if current OS is Linux.
   *
   * @returns True if Linux, false otherwise.
   */
  static isLinux(): boolean {
    return this.browser.getOSName() === OSName.LINUX;
  }

  /**
   * Check if current browser version is greater than the given version.
   *
   * @param version - The version to compare with the current browser version.
   * @returns True if greater than, false otherwise.
   */
  static isVersionGreaterThan(version: string): boolean {
    const browserName = this.browser.getBrowserName();
    const checkTree = { [browserName]: `>${version}` };
    return this.browser.satisfies(checkTree) as boolean;
  }

  /**
   * Check if current browser version is greater than or equal to the given version.
   *
   * @param version - The version to compare with the current browser version.
   * @returns True if greater than or equal to, false otherwise.
   */
  static isVersionGreaterThanOrEqualTo(version: string): boolean {
    const browserName = this.browser.getBrowserName();
    const checkTree = { [browserName]: `>=${version}` };
    return this.browser.satisfies(checkTree) as boolean;
  }

  /**
   * Check if current browser version is less than the given version.
   *
   * @param version - The version to compare with the current browser version.
   * @returns True if less than, false otherwise.
   */
  static isVersionLessThan(version: string): boolean {
    const browserName = this.browser.getBrowserName();
    const checkTree = { [browserName]: `<${version}` };
    return this.browser.satisfies(checkTree) as boolean;
  }

  /**
   * Check if current browser version is less than or equal to the given version.
   *
   * @param version - The version to compare with the current browser version.
   * @returns True if less than or equal to, false otherwise.
   */
  static isVersionLessThanOrEqualTo(version: string): boolean {
    const browserName = this.browser.getBrowserName();
    const checkTree = { [browserName]: `<=${version}` };
    return this.browser.satisfies(checkTree) as boolean;
  }

  /**
   * Check if current browser version is a sub-version of the given version.
   *
   * @param version - The version to compare with the current browser version.
   * @returns True if is sub-version of, false otherwise.
   */
  static isSubVersionOf(version: string): boolean {
    const browserName = this.browser.getBrowserName();
    const checkTree = { [browserName]: `~${version}` };
    return this.browser.satisfies(checkTree) as boolean;
  }
}
