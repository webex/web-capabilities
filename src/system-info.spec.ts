// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pressureObserverCallback: any;

/**
 * Mock implementation of PressureObserver to simulate CPU pressure states.
 */
class MockPressureObserver {
  /**
   * Mock implementation of PressureObserver to simulate CPU pressure states.
   *
   * @param callback - The callback to be called with pressure records.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(callback: (list: any) => void) {
    pressureObserverCallback = callback;
  }

  /**
   * Attaches the observer to a source to observe state changes.
   */
  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
  observe() {}
}

Object.defineProperty(window, 'PressureObserver', {
  writable: true,
  configurable: true,
  value: MockPressureObserver,
});

// Import the SystemInfo class after defining the PressureObserver mock
// This ensures that the mock is available when SystemInfo is imported.
// eslint-disable-next-line import/first
import { SystemInfo } from './system-info';

// Extend the Window interface to include PressureObserver
// NOTE: This is needed for TypeScript to recognize PressureObserver
//       since it is not a standard part of the Window interface yet.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PressureObserver?: new (callback: (records: any[]) => void) => {
      observe: (source: string) => void;
      disconnect: () => void;
    };
  }
}

describe('SystemInfo', () => {
  describe('isPressureObserverSupported', () => {
    it('should return true when PressureObserver is supported', () => {
      expect.hasAssertions();

      Object.defineProperty(window, 'PressureObserver', {
        writable: true,
        configurable: true,
        value: {},
      });

      expect(SystemInfo.isPressureObserverSupported()).toBe(true);
    });

    it('should return false when PressureObserver is not supported', () => {
      expect.hasAssertions();

      // Ensure that PressureObserver is not defined
      delete window.PressureObserver;

      expect(SystemInfo.isPressureObserverSupported()).toBe(false);
    });
  });

  describe('getCpuPressure', () => {
    describe('when PressureObserver is supported', () => {
      beforeEach(() => {
        Object.defineProperty(window, 'PressureObserver', {
          writable: true,
          configurable: true,
          value: MockPressureObserver,
        });
      });

      it('should return undefined when information is not available', () => {
        expect.hasAssertions();

        expect(SystemInfo.getCpuPressure()).toBeUndefined();
      });

      ['nominal', 'fair', 'serious', 'critical'].forEach((state) => {
        it(`should return the last CPU pressure state as ${state}`, () => {
          expect.hasAssertions();

          pressureObserverCallback([{ source: 'cpu', state }]);

          expect(SystemInfo.getCpuPressure()).toBe(state);
        });
      });
    });

    describe('when PressureObserver is not supported', () => {
      beforeEach(() => {
        // Ensure that PressureObserver is not defined
        delete window.PressureObserver;
      });

      it('should return undefined', () => {
        expect.hasAssertions();

        expect(SystemInfo.getCpuPressure()).toBeUndefined();
      });
    });
  });

  describe('onCpuPressureChange', () => {
    describe('when PressureObserver is supported', () => {
      beforeEach(() => {
        Object.defineProperty(window, 'PressureObserver', {
          writable: true,
          configurable: true,
          value: MockPressureObserver,
        });
      });

      it('should call the callback when CPU pressure state changes', () => {
        expect.hasAssertions();

        const callback = jest.fn();
        SystemInfo.onCpuPressureChange(callback);

        pressureObserverCallback([{ source: 'cpu', state: 'nominal' }]);
        expect(callback).toHaveBeenCalledWith('nominal');
      });

      it('should not call the callback if the CPU pressure state does not change', () => {
        expect.hasAssertions();

        const callback = jest.fn();
        SystemInfo.onCpuPressureChange(callback);

        // Call with the same state
        pressureObserverCallback([{ source: 'cpu', state: 'nominal' }]);
        expect(callback).not.toHaveBeenCalled();

        // Call with a different state
        pressureObserverCallback([{ source: 'cpu', state: 'fair' }]);
        expect(callback).toHaveBeenCalledWith('fair');
      });

      it('should not emit if callback was deregistered', () => {
        expect.hasAssertions();

        const callback = jest.fn();
        SystemInfo.onCpuPressureChange(callback);

        // Call with the same state
        pressureObserverCallback([{ source: 'cpu', state: 'nominal' }]);
        expect(callback).toHaveBeenCalledWith('nominal');

        // Deregister the callback
        SystemInfo.offCpuPressureChange(callback);

        // Call with a different state
        pressureObserverCallback([{ source: 'cpu', state: 'fair' }]);
        expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
      });
    });

    describe('when PressureObserver is not supported', () => {
      beforeEach(() => {
        // Ensure that PressureObserver is not defined
        delete window.PressureObserver;
      });

      it('should throw', () => {
        expect.hasAssertions();

        const callback = jest.fn();
        expect(() => SystemInfo.onCpuPressureChange(callback)).toThrow(expect.anything());
      });
    });
  });

  describe('getNumLogicalCores', () => {
    it('should return the number of logical CPU cores when the information is available', () => {
      expect.assertions(1);

      jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockReturnValue(1);

      expect(SystemInfo.getNumLogicalCores()).toBe(1);
    });

    it('should return undefined when the logical CPU cores information is not available', () => {
      expect.assertions(1);

      jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockImplementation();

      expect(SystemInfo.getNumLogicalCores()).toBeUndefined();
    });
  });
});
