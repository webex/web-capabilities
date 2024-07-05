/**
 * Provides information about the screen dimensions.
 */
export class windowInfo {
  /**
   * Retrieves the width of the screen.
   *
   * @returns The width of the screen in pixels, or undefined if not available.
   */
  static getScreenWidth(): number | undefined {
    return window.screen.width;
  }

  /**
   * Retrieves the height of the screen.
   *
   * @returns The height of the screen in pixels, or undefined if not available.
   */
  static getScreenHeight(): number | undefined {
    return window.screen.height;
  }

  /**
   * Retrieves the width of the browser window's content area.
   *
   * @returns The width of the content area in pixels, or undefined if not available.
   */
  static getWindowWidth(): number | undefined {
    return window.innerWidth;
  }

  /**
   * Retrieves the height of the browser window's content area.
   *
   * @returns The height of the content area in pixels, or undefined if not available.
   */
  static getWindowHeight(): number | undefined {
    return window.innerHeight;
  }
}
