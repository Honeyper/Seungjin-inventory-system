(function initializeSeungjinQrLabel(globalScope) {
  function getProcessStep(value) {
    const match = String(value || "").match(/([1-6])\s*도/);
    return match ? Number(match[1]) : 0;
  }

  function isEnabled(value) {
    return ["유", "y", "yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase());
  }

  function getQuantityNumber(value) {
    const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  function getBoxQuantityData({
    currentQuantity,
    boxQuantity,
    referenceQuantity,
    sequence,
    fullBoxCount,
    totalBoxCount,
    remainderCount
  } = {}) {
    const standardQuantity = getQuantityNumber(referenceQuantity);
    const actualQuantity = getQuantityNumber(currentQuantity)
      || getQuantityNumber(boxQuantity)
      || standardQuantity;
    const boxSequence = getQuantityNumber(sequence);
    const fullBoxes = getQuantityNumber(fullBoxCount);
    const totalBoxes = getQuantityNumber(totalBoxCount);
    const remainders = getQuantityNumber(remainderCount);
    const isRemainderByFullBoxCount = fullBoxes > 0 && boxSequence > fullBoxes;
    const isRemainderByPosition = remainders > 0
      && totalBoxes > 0
      && boxSequence > totalBoxes - remainders;

    return {
      quantity: actualQuantity,
      isRemainder: isRemainderByFullBoxCount
        || isRemainderByPosition
        || (actualQuantity > 0 && standardQuantity > 0 && actualQuantity < standardQuantity)
    };
  }

  function getProcessSummary({
    finalProcess = "-",
    flameTreatmentStatus = "무",
    dustRemovalStatus = "무"
  } = {}) {
    if (["코팅", "라벨"].includes(String(finalProcess).trim())) return String(finalProcess).trim();
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
    dustRemovalStatus = "무",
    processGroups = null
  } = {}) {
    const singleProcess = String(finalProcess).trim();
    if (["코팅", "라벨"].includes(singleProcess)) {
      return [
        { label: singleProcess, disabled: false, treatment: false },
        { label: "2도", disabled: true, treatment: false },
        { label: "3도", disabled: true, treatment: false }
      ];
    }
    const hasFlameTreatment = isEnabled(flameTreatmentStatus);
    const hasDustRemoval = isEnabled(dustRemovalStatus);
    const finalStep = getProcessStep(finalProcess);
    if (Array.isArray(processGroups) || finalStep > 3) {
      const rows = getProcessGroups({ finalProcess, processGroups }).map(group => ({
        label: group.map(step => `${step}도`).join("+"), disabled: false, treatment: false
      }));
      if (hasFlameTreatment) rows.unshift({label: "화염", disabled: false, treatment: true});
      if (hasDustRemoval) rows.push({label: "박가루", disabled: false, treatment: true});
      while (rows.length < 3) rows.push({label: "---", disabled: true, treatment: false});
      return rows;
    }
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

  function getProcessGroups({ finalProcess = "", processGroups = null } = {}) {
    const defaults = Array.from({length: getProcessStep(finalProcess)}, (_, index) => [index + 1]);
    return Array.isArray(processGroups) && processGroups.every(group => Array.isArray(group) && group.length)
      && JSON.stringify(processGroups.flat()) === JSON.stringify(defaults.flat())
      ? processGroups.map(group => [...group]) : defaults;
  }

  globalScope.SeungjinQrLabel = Object.freeze({
    getBoxQuantityData,
    getProcessRows,
    getProcessGroups,
    getProcessSummary,
    getProcessStep,
    isEnabled
  });
}(globalThis));
