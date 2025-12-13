# Scripting Examples

## 1. Formatting Currency for Document
**Scenario**: User enters raw number `50000`. Document needs `$50,000.00`.
**Type**: Document Hook (`beforeGeneration`)

```javascript
// Input: ["loan_amount"]
// Output: ["loan_amount_display"]

const amount = input.loan_amount || 0;
const formatted = helpers.number.formatCurrency(amount, 'USD');

return {
  loan_amount_display: formatted
};
```

## 2. Conditional Logic based on Date
**Scenario**: If the user is a minor (<18), set a flag.
**Type**: JS Block or Lifecycle Hook

```javascript
// Input: ["birthDate"]
// Output: ["is_minor"]

if (!input.birthDate) return { is_minor: false };

const now = helpers.date.now();
const age = helpers.date.diff(input.birthDate, now, 'years');

return {
  is_minor: age < 18
};
```

## 3. Filtering a List
**Scenario**: Filter a list of products to only those strictly above $100.
**Type**: JS Block

```javascript
// Input: ["products"]
// Output: ["expensive_products"]

const products = input.products || [];
const filtered = products.filter(p => p.price > 100);

return {
  expensive_products: filtered
};
```

## 4. Complex Validation
**Scenario**: Ensure at least one contact method is provided.
**Type**: Lifecycle Hook (`afterPage`)

```javascript
// Input: ["email", "phone", "address"]

if (!input.email && !input.phone && !input.address) {
  throw new Error("You must provide at least one contact method (Email, Phone, or Address).");
}
// Returns nothing = success
```
