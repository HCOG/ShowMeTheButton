# ShowMeTheButton SDK

Frontend SDK for integrating ShowMeTheButton into web applications.

## Structure

```
show-me-sdk/
├── packages/
│   ├── core/           # Framework-agnostic core
│   │   ├── cursor/      # Cursor management
│   │   ├── scanner/     # DOM scanner
│   │   ├── locator/     # Element locator
│   │   ├── animation/   # Animation engine
│   │   ├── input/      # Voice/text input
│   │   ├── bus/        # Event bus
│   │   └── client/     # Agent client
│   │
│   └── angular/        # Angular adapter
│
├── package.json
└── README.md
```

## Installation

```bash
npm install @show-me/sdk-core
```

## Usage

```typescript
import { ShowMeSDK } from '@show-me/sdk-core';

const sdk = new ShowMeSDK({
  agentEndpoint: 'http://localhost:8001'
});

await sdk.init();
sdk.activate();

const result = await sdk.query('我想导出报表');
```

See main [README.md](../README.md) for more information.
