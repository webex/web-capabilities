import type { PressureState } from './system-info';

type SystemInfoType = typeof import('./system-info').SystemInfo;

/**
 * Artificial scenarios used only to configure permissions policy mocks in these tests.
 *
 * Each name tells the test whether the mocked policy API should allow access, deny access,
 * throw, use the legacy API, or be unavailable.
 *
 * @see https://w3c.github.io/compute-pressure/#policy-control
 */
type PolicyTestScenario = 'allowed' | 'denied' | 'throws' | 'legacy-denied' | 'unavailable';
type PressureRecord = {
  source: string;
  state: PressureState;
  time: number;
};
type PressureObserverCallback = (records: PressureRecord[]) => void;
type ObserveMock = jest.Mock<Promise<void>, [string]>;

let pressureObserverCallback: PressureObserverCallback | undefined;
let observeMock: ObserveMock;
let allowsFeatureMock: jest.Mock<boolean, [string]>;

/**
 * Defines a mock browser API property.
 *
 * @param target - Object that owns the property.
 * @param property - Property to define.
 * @param value - Mock property value.
 */
const defineBrowserProperty = (
  target: Window | Document,
  property: string,
  value: unknown
): void => {
  Object.defineProperty(target, property, {
    writable: true,
    configurable: true,
    value,
  });
};

/**
 * Creates a resolving observe mock.
 *
 * @returns A mock of PressureObserver.observe().
 */
const createObserveMock = (): ObserveMock =>
  jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);

/**
 * Installs a mock PressureObserver constructor.
 *
 * @param options - Observer behavior.
 * @param options.observe - Optional observe implementation.
 * @param options.observerConstructor - Optional constructor implementation.
 * @param options.supported - Whether PressureObserver exists.
 */
const setPressureObserver = (options?: {
  observe?: ObserveMock;
  observerConstructor?: jest.Mock;
  supported?: boolean;
}): void => {
  pressureObserverCallback = undefined;
  observeMock = options?.observe ?? createObserveMock();

  if (options?.supported === false) {
    defineBrowserProperty(window, 'PressureObserver', undefined);
    return;
  }

  const constructor =
    options?.observerConstructor ??
    jest.fn().mockImplementation((callback: PressureObserverCallback) => {
      pressureObserverCallback = callback;

      return {
        observe: observeMock,
      };
    });

  defineBrowserProperty(window, 'PressureObserver', constructor);
};

/**
 * Installs the selected permissions policy behavior.
 *
 * @param scenario - Mock policy behavior to install.
 */
const setPermissionsPolicy = (scenario: PolicyTestScenario): void => {
  defineBrowserProperty(document, 'permissionsPolicy', undefined);
  defineBrowserProperty(document, 'featurePolicy', undefined);

  if (scenario === 'unavailable') {
    allowsFeatureMock = jest.fn();
    return;
  }

  allowsFeatureMock =
    scenario === 'throws'
      ? jest.fn<boolean, [string]>(() => {
          throw new DOMException('Permissions Policy is unavailable', 'NotSupportedError');
        })
      : jest.fn<boolean, [string]>(
          (feature) => feature === 'compute-pressure' && scenario === 'allowed'
        );

  const policy = { allowsFeature: allowsFeatureMock };
  const property = scenario === 'legacy-denied' ? 'featurePolicy' : 'permissionsPolicy';

  defineBrowserProperty(document, property, policy);
};

/**
 * Loads SystemInfo with a fresh module-level singleton.
 *
 * @param options - Browser API behavior.
 * @param options.policy - Permissions policy behavior.
 * @param options.observe - Optional observe implementation.
 * @param options.observerConstructor - Optional PressureObserver constructor.
 * @param options.supported - Whether PressureObserver exists.
 * @returns The isolated SystemInfo class.
 */
const loadSystemInfo = (options?: {
  policy?: PolicyTestScenario;
  observe?: ObserveMock;
  observerConstructor?: jest.Mock;
  supported?: boolean;
}): SystemInfoType => {
  let SystemInfo: SystemInfoType | undefined;

  jest.isolateModules(() => {
    setPressureObserver(options);
    setPermissionsPolicy(options?.policy ?? 'allowed');
    SystemInfo = jest.requireActual<typeof import('./system-info')>('./system-info').SystemInfo;
  });

  if (!SystemInfo) {
    throw new Error('Failed to load SystemInfo module');
  }

  return SystemInfo;
};

/**
 * Sends a pressure record to the installed observer.
 *
 * @param state - CPU pressure state to emit.
 */
const emitPressure = (state: PressureState): void => {
  if (!pressureObserverCallback) {
    throw new Error('PressureObserver callback was not installed');
  }

  pressureObserverCallback([{ source: 'cpu', state, time: 0 }]);
};

describe('SystemInfo', () => {
  describe('isPressureObserverSupported', () => {
    it('should return true when PressureObserver is supported', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();

      expect(SystemInfo.isPressureObserverSupported()).toBe(true);
    });

    it('should return false when PressureObserver is not supported', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo({ supported: false });

      expect(SystemInfo.isPressureObserverSupported()).toBe(false);
    });
  });

  describe('module import', () => {
    it('should observe CPU pressure when permissions policy allows it', () => {
      expect.hasAssertions();

      loadSystemInfo();

      expect(observeMock).toHaveBeenCalledWith('cpu');
    });

    it('should skip observation when permissions policy denies it', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo({ policy: 'denied' });
      const callback = jest.fn();

      SystemInfo.onCpuPressureChange(callback);

      expect(observeMock).not.toHaveBeenCalled();
      expect(SystemInfo.getCpuPressure()).toBeUndefined();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should use legacy featurePolicy when permissionsPolicy is unavailable', () => {
      expect.hasAssertions();

      loadSystemInfo({ policy: 'legacy-denied' });

      expect(allowsFeatureMock).toHaveBeenCalledWith('compute-pressure');
      expect(observeMock).not.toHaveBeenCalled();
    });

    it('should skip observation when permissions policy inspection throws', () => {
      expect.hasAssertions();

      expect(() => loadSystemInfo({ policy: 'throws' })).not.toThrow();
      expect(observeMock).not.toHaveBeenCalled();
    });

    it('should observe when policy inspection APIs are unavailable', () => {
      expect.hasAssertions();

      loadSystemInfo({ policy: 'unavailable' });

      expect(observeMock).toHaveBeenCalledWith('cpu');
    });

    it('should not throw when the PressureObserver constructor fails', () => {
      expect.hasAssertions();

      const observerConstructor = jest.fn().mockImplementation(() => {
        throw new DOMException('PressureObserver is unavailable', 'NotSupportedError');
      });

      expect(() => loadSystemInfo({ observerConstructor })).not.toThrow();
    });

    it('should handle observe() rejection', async () => {
      expect.hasAssertions();

      const rejectedObserve = jest
        .fn<Promise<void>, [string]>()
        .mockRejectedValue(
          new DOMException(
            'Access to the feature "compute pressure" is disallowed by permissions policy.',
            'NotAllowedError'
          )
        );

      loadSystemInfo({ observe: rejectedObserve });
      await Promise.resolve();

      expect(rejectedObserve).toHaveBeenCalledWith('cpu');
    });
  });

  describe('getCpuPressure', () => {
    it('should return undefined before pressure information is available', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();

      expect(SystemInfo.getCpuPressure()).toBeUndefined();
    });

    (['nominal', 'fair', 'serious', 'critical'] as PressureState[]).forEach((state) => {
      it(`should return the last CPU pressure state as ${state}`, () => {
        expect.hasAssertions();

        const SystemInfo = loadSystemInfo();

        emitPressure(state);

        expect(SystemInfo.getCpuPressure()).toBe(state);
      });
    });

    it('should return undefined when PressureObserver is unsupported', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo({ supported: false });

      expect(SystemInfo.getCpuPressure()).toBeUndefined();
    });
  });

  describe('onCpuPressureChange', () => {
    it('should not start another observation when a listener is registered', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();

      SystemInfo.onCpuPressureChange(jest.fn());

      expect(observeMock).toHaveBeenCalledTimes(1);
    });

    it('should call the callback when CPU pressure changes', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();
      const callback = jest.fn();

      SystemInfo.onCpuPressureChange(callback);
      emitPressure('nominal');

      expect(callback).toHaveBeenCalledWith('nominal');
    });

    it('should immediately call a new listener with the current pressure state', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();
      const callback = jest.fn();

      emitPressure('fair');
      SystemInfo.onCpuPressureChange(callback);

      expect(callback).toHaveBeenCalledWith('fair');
    });

    it('should only call the callback when the pressure state changes', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();
      const callback = jest.fn();

      SystemInfo.onCpuPressureChange(callback);
      emitPressure('nominal');
      emitPressure('nominal');
      emitPressure('fair');

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith('fair');
    });

    it('should stop calling a deregistered callback', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();
      const callback = jest.fn();

      SystemInfo.onCpuPressureChange(callback);
      emitPressure('nominal');
      SystemInfo.offCpuPressureChange(callback);
      emitPressure('fair');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not attach a listener when PressureObserver is unsupported', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo({ supported: false });
      const callback = jest.fn();

      SystemInfo.onCpuPressureChange(callback);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getNumLogicalCores', () => {
    it('should return the number of logical CPU cores when available', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();

      jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockReturnValue(1);

      expect(SystemInfo.getNumLogicalCores()).toBe(1);
    });

    it('should return undefined when logical CPU core information is unavailable', () => {
      expect.hasAssertions();

      const SystemInfo = loadSystemInfo();

      jest.spyOn(Navigator.prototype, 'hardwareConcurrency', 'get').mockImplementation();

      expect(SystemInfo.getNumLogicalCores()).toBeUndefined();
    });
  });
});
