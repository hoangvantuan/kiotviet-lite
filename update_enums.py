import re

with open('packages/shared/src/schema/audit-log.ts', 'r', encoding='utf-8') as f:
    content = f.read()

if 'order.price_mismatch_adjusted' not in content:
    content = content.replace(
        "| 'order.debt_limit_exceeded'",
        "| 'order.debt_limit_exceeded'\n  | 'order.price_mismatch_adjusted'"
    )
    with open('packages/shared/src/schema/audit-log.ts', 'w', encoding='utf-8') as f:
        f.write(content)


with open('packages/shared/src/schema/notifications.ts', 'r', encoding='utf-8') as f:
    content = f.read()

if 'order.price_mismatch_adjusted' not in content:
    content = content.replace(
        "'order.debt_limit_exceeded',",
        "'order.debt_limit_exceeded',\n  'order.price_mismatch_adjusted',"
    )
    with open('packages/shared/src/schema/notifications.ts', 'w', encoding='utf-8') as f:
        f.write(content)

