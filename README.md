# web-capabilities

A library to check Webex feature capabilities for web clients.

# Example

Use the `WebCapabilities` class to check whether the machine is capable of certain features.

```javascript
import { CapabilityState, WebCapabilities } from '@webex/web-capabilities';

if (WebCapabilities.isCapableOfBackgroundNoiseRemoval() === CapabilityState.CAPABLE) {
  console.log('This machine is capable of background noise removal!');
}
```

Use the `BrowserInfo` class to check certain details about the browser.

```javascript
import { BrowserInfo } from '@webex/web-capabilities';

if (BrowserInfo.isChrome() && BrowserInfo.isSubVersionOf('110')) {
  console.log('This browser is Chrome version 110!');
}
```

Use the `CpuInfo` class to check certain details about the CPU.

```javascript
import { CpuInfo } from '@webex/web-capabilities';

const logicalCores = CpuInfo.getNumLogicalCores();

if (logicalCores) {
    console.log(`Number of logical CPU cores: ${logicalCores}`);
}
```


# Setup

1. Run `yarn` to install dependencies.
2. Run `yarn prepare` to prepare dependencies.
3. Run `yarn watch` to build and watch for updates.
4. Run `yarn test` to build, run tests, lint, and run test coverage.

## Visual Studio Code

Install the recommended extensions when first opening the workspace (there should be a prompt). These plugins will help maintain high code quality and consistency across the project.

---

**NOTE**: VS Code is setup to apply formatting and linting rules on save (Prettier runs first, then ESLint). The rules applied are defined in [settings.json](.vscode/settings.json).

---

### Extensions

- [Code Spell (streetsidesoftware.code-spell-checker)](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker)
- [ESLint (dbaeumer.vscode-eslint)](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Format Code Action (rohit-gohri.format-code-action)](https://marketplace.visualstudio.com/items?itemName=rohit-gohri.format-code-action)
- [GitLens (eamodio.gitlens)](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)
- [Prettier (esbenp.prettier-vscode)](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
