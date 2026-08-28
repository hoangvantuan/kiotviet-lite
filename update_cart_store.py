import re

with open('apps/web/src/stores/use-cart-store.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update TabState interface
if 'priceOverridePin' not in content:
    content = content.replace(
        "customerGroupName: string | null",
        "customerGroupName: string | null\n  priceOverridePin: string | null"
    )

    # 2. Update CartState interface
    content = content.replace(
        "clearCart: () => void",
        "setPriceOverridePin: (pin: string | null) => void\n  clearCart: () => void"
    )

    # 3. Update createEmptyTab
    content = content.replace(
        "customerGroupName: null,",
        "customerGroupName: null,\n    priceOverridePin: null,"
    )

    # 4. Implement setPriceOverridePin
    content = content.replace(
        "clearCart: () => {",
        "setPriceOverridePin: (pin) => {\n    set((state) => updateActiveTab(state, (tab) => ({ ...tab, priceOverridePin: pin })))\n  },\n\n  clearCart: () => {"
    )

with open('apps/web/src/stores/use-cart-store.ts', 'w', encoding='utf-8') as f:
    f.write(content)


with open('apps/web/src/features/pos/components/EditUnitPriceDialog.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'setPriceOverridePin' not in content:
    content = content.replace(
        "const updateUnitPrice = useCartStore((s) => s.updateUnitPrice)",
        "const updateUnitPrice = useCartStore((s) => s.updateUnitPrice)\n  const setPriceOverridePin = useCartStore((s) => s.setPriceOverridePin)"
    )
    
    content = content.replace(
        "function handlePinVerified() {",
        "function handlePinVerified(pin?: string) {"
    )
    
    content = content.replace(
        "applyEdit(price, reasonText, true)",
        "if (pin) {\n      setPriceOverridePin(pin)\n    }\n    applyEdit(price, reasonText, true)"
    )

with open('apps/web/src/features/pos/components/EditUnitPriceDialog.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

with open('apps/web/src/features/pos/components/PosScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'priceOverridePin:' not in content:
    content = content.replace(
        "debtLimitOverridePin: payload.debtLimitOverridePin,",
        "debtLimitOverridePin: payload.debtLimitOverridePin,\n        priceOverridePin: tab.priceOverridePin ?? undefined,"
    )

with open('apps/web/src/features/pos/components/PosScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

