import assert from 'node:assert/strict';
import test from 'node:test';
import {loadFunctions, adminSource} from './helpers/frontend-runtime.mjs';

test('copy registration creates a new product and selects it in the originating form', async () => {
  for (const target of ['inbound', 'purchaseOrder', 'existingStock', 'productionPlan']) {
    const original = {productCode: 'P-OLD', productName: '원본 제품'};
    const created = {productCode: 'P-NEW', productName: '새 제품'};
    const calls = [];
    let selected;
    const app = loadFunctions(adminSource, ['saveProduct'], {
      state: {productFormMode: 'copy', editingProductCode: '', productFormReturnTarget: target,
        isSavingProduct: false, products: [original]},
      getProductFormPayload: () => ({'제품명': '새 제품', '업체명': '거래처'}),
      validateProductPayload: () => '',
      setProductSaving() {}, setFormMessage() {}, closeProductModal() {}, showToast() {},
      resolveProductImageUrls: async () => ['image-url'],
      requestApi: async (action, payload) => {calls.push({action, payload});return {productId: 'P-NEW'};},
      loadProducts: async () => {},
      getProductByCode: code => code === 'P-NEW' ? created : original,
      selectInboundProduct: product => {selected = ['inbound', product];},
      selectPurchaseOrderProduct: product => {selected = ['purchaseOrder', product];},
      selectExistingStockProduct: product => {selected = ['existingStock', product];},
      selectProductionPlanProduct: product => {selected = ['productionPlan', product];}
    });
    await app.saveProduct();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, 'createProduct');
    assert.equal(calls[0].payload.productId, undefined);
    assert.equal(calls[0].payload.productCode, undefined);
    assert.deepEqual(selected, [target, created]);
    assert.deepEqual(original, {productCode: 'P-OLD', productName: '원본 제품'});
  }
});

test('copy keeps source settings and images but clears identity while edit retains identity', () => {
  const product = {productCode: 'P-OLD', clientName: '거래처', productName: '원본 제품', color: '블랙',
    boxQuantity: '1,000 ea', trayQuantity: '200 ea', hourlyProductionRate: 1200, note: '메모',
    isCommonContainer: true, shippingProductNames: ['A', 'B'], shippingProductTypeCount: 2,
    productImageUrls: ['image-one', 'image-two']};
  const before = structuredClone(product);
  const fields = ['productCodePreview', 'productClientName', 'productNameInput', 'productColor',
    'productOrderQuantity', 'productDueDate', 'productBoxQuantity', 'productTrayQuantity',
    'productHourlyProductionRate', 'productNote', 'productCommonContainer', 'productModalTitle',
    'productModalDescription', 'saveProductButton', 'productModal'];
  const globals = Object.fromEntries(fields.map(key => [key, {value: '', focus() {}}]));
  let process;
  let shippingNames;
  const app = loadFunctions(adminSource, ['openProductModal'], {
    ...globals, state: {}, productForm: {reset() {}, querySelector: () => ({click() {}})},
    productFormMessage: {classList: {remove() {}}},
    revokeProductImagePreviewUrls() {}, getProductImageUrls: value => [...value.productImageUrls],
    ensureCommonContainerCountOption() {}, renderCommonContainerProductNameFields(count, values) {shippingNames = [...values];},
    syncCommonContainerFields() {}, renderClientOptions() {},
    setProductProcessForm(value) {process = value;}, setSelectValue(field, value) {field.value = value;},
    normalizeEditableValue: value => value ?? '', normalizeBinaryOption: () => '무', normalizeUsageStatus: () => '사용중',
    normalizeCommonContainerProductNames: value => value || [], isCommonContainerProduct: Boolean,
    extractQuantityNumber: value => String(value || '').replace(/[^0-9]/g, ''), toDateInputValue: () => '',
    renderProductImageSelection() {}, updateProductColorPreview() {}, setProductSaving() {}, resetModalScrollPosition() {},
    document: {body: {classList: {add() {}}}}, window: {setTimeout() {}}
  });
  app.openProductModal('copy', product);
  assert.equal(app.state.productFormMode, 'copy');
  assert.equal(app.state.editingProductCode, '');
  assert.equal(app.productCodePreview.value, '');
  assert.equal(app.productNameInput.value, product.productName);
  assert.equal(app.productBoxQuantity.value, '1000');
  assert.equal(app.productTrayQuantity.value, '200');
  assert.equal(app.productHourlyProductionRate.value, 1200);
  assert.equal(process, product);
  assert.deepEqual(shippingNames, ['A', 'B']);
  app.state.productImageUrls.pop();
  assert.deepEqual(product, before);
  app.openProductModal('edit', product);
  assert.equal(app.state.editingProductCode, 'P-OLD');
  assert.equal(app.productCodePreview.value, 'P-OLD');
});
