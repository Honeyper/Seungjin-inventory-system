(function initializeSeungjinQrLabel(globalScope) {
  function getProcessStep(value) {
    const match = String(value || "").match(/([1-3])\s*도/);
    return match ? Number(match[1]) : 0;
  }

  function isEnabled(value) {
    return ["유", "y", "yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase());
  }

  function getQuantityNumber(value) {
    const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  function getBoxQuantityData({ currentQuantity, boxQuantity, referenceQuantity } = {}) {
    const standardQuantity = getQuantityNumber(referenceQuantity);
    const actualQuantity = getQuantityNumber(currentQuantity)
      || getQuantityNumber(boxQuantity)
      || standardQuantity;

    return {
      quantity: actualQuantity,
      isRemainder: actualQuantity > 0 && standardQuantity > 0 && actualQuantity < standardQuantity
    };
  }

  function getProcessSummary({
    finalProcess = "-",
    flameTreatmentStatus = "무",
    dustRemovalStatus = "무"
  } = {}) {
    const treatments = [];

    if (isEnabled(dustRemovalStatus)) {
      treatments.push("박가루");
    }
    if (isEnabled(flameTreatmentStatus)) {
      treatments.push("화염");
    }

    return treatments.length
      ? `${finalProcess || "-"} / ${treatments.join(" / ")}`
      : (finalProcess || "-");
  }

  function getProcessRows({
    finalProcess = "",
    flameTreatmentStatus = "무",
    dustRemovalStatus = "무"
  } = {}) {
    const hasFlameTreatment = isEnabled(flameTreatmentStatus);
    const hasDustRemoval = isEnabled(dustRemovalStatus);
    const finalStep = getProcessStep(finalProcess);
    const labels = hasFlameTreatment
      ? ["화염", "1도", "2도"]
      : ["1도", "2도", "3도"];

    if (hasDustRemoval) {
      labels[2] = "박가루";
    }

    return labels.map((label) => {
      const step = getProcessStep(label);
      return {
        label,
        disabled: Boolean(step && finalStep && step > finalStep),
        treatment: !step
      };
    });
  }

  globalScope.SeungjinQrLabel = Object.freeze({
    getBoxQuantityData,
    getProcessRows,
    getProcessSummary,
    getProcessStep,
    isEnabled
  });
}(globalThis));
