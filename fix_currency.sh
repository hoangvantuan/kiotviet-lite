#!/bin/bash
sed -i '' "s/suffix: string = ' đ'/suffix: string = '\\\xA0đ'/" packages/shared/src/utils/currency.ts
sed -i '' "s/return \\\`\${formatted || '0'}đ\\\`/return formatVndWithSuffix(value ?? 0)/" packages/shared/src/utils/currency.ts
