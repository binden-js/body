# @kauai/body ![CI Status](https://github.com/b2broker/body/workflows/CI/badge.svg) [![version](https://img.shields.io/github/package-json/v/b2broker/body?style=plastic)](https://github.com/b2broker/body) [![Known Vulnerabilities](https://snyk.io/test/github/b2broker/body/badge.svg)](https://snyk.io/test/github/b2broker/body) [![Coverage Status](https://coveralls.io/repos/github/b2broker/body/badge.svg?branch=main)](https://coveralls.io/github/b2broker/body?branch=main) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier) [![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release) [![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org) ![GitHub top language](https://img.shields.io/github/languages/top/b2broker/body) ![node version](https://img.shields.io/node/v/@kauai/body) ![npm downloads](https://img.shields.io/npm/dt/@kauai/body) ![License](https://img.shields.io/github/license/b2broker/body)

[Kauai](https://github.com/b2broker/kauai) body parser middleware. Supports the following [content types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type)

- `application/json`
- `application/x-www-form-urlencoded`
- `plain/text`

and any combination of the following [encodings](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding)

- `br`
- `x-gzip`
- `gzip`
- `deflate`

## Installation

```bash
npm install @kauai/body
```

## Usage

```typescript
import BodyParser from "@kauai/body";

class MyMiddleware extends Middleware {
  public run(context: Context): void {
    const { body } = context.request;
    context.log.info("Body has been parsed (or not)", { body });
  }
}

app.use("/deposit", new Router().post(new BodyParser(), new MyMiddleware()));
```

### Test

```bash
npm run test:ci
```
