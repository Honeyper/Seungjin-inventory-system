(function initializeSeungjinSegmentedDate(globalScope) {
  const DATE_PARTS = ["year", "month", "day"];
  const DATE_PART_LENGTHS = Object.freeze({ year: 4, month: 2, day: 2 });

  function sanitizeDatePart(value, part) {
    return String(value ?? "")
      .replace(/\D/g, "")
      .slice(0, DATE_PART_LENGTHS[part] || 0);
  }

  function splitDateValue(value) {
    const matched = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return matched
      ? { year: matched[1], month: matched[2], day: matched[3] }
      : { year: "", month: "", day: "" };
  }

  function composeDateValue(parts) {
    const year = sanitizeDatePart(parts?.year, "year");
    const month = sanitizeDatePart(parts?.month, "month");
    const day = sanitizeDatePart(parts?.day, "day");

    if (year.length !== 4 || month.length !== 2 || day.length !== 2) {
      return "";
    }

    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const candidate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
    if (
      candidate.getUTCFullYear() !== yearNumber
      || candidate.getUTCMonth() + 1 !== monthNumber
      || candidate.getUTCDate() !== dayNumber
    ) {
      return "";
    }

    return `${year}-${month}-${day}`;
  }

  function parsePastedDate(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 8) return null;
    const parts = {
      year: digits.slice(0, 4),
      month: digits.slice(4, 6),
      day: digits.slice(6, 8)
    };
    return composeDateValue(parts) ? parts : null;
  }

  function createController(root, nativeInput) {
    if (!root || !nativeInput) return null;
    const fields = Object.fromEntries(DATE_PARTS.map((part) => [
      part,
      root.querySelector(`[data-date-part="${part}"]`)
    ]));
    if (DATE_PARTS.some((part) => !fields[part])) return null;

    function getParts() {
      return Object.fromEntries(DATE_PARTS.map((part) => [part, fields[part].value]));
    }

    function syncNativeValue() {
      nativeInput.value = composeDateValue(getParts());
      root.classList.toggle(
        "is-invalid",
        DATE_PARTS.every((part) => fields[part].value.length === DATE_PART_LENGTHS[part])
          && !nativeInput.value
      );
    }

    function setValue(value) {
      const normalizedValue = composeDateValue(splitDateValue(value));
      const parts = splitDateValue(normalizedValue);
      DATE_PARTS.forEach((part) => {
        fields[part].value = parts[part];
      });
      nativeInput.value = normalizedValue;
      root.classList.remove("is-invalid");
    }

    DATE_PARTS.forEach((part, index) => {
      const field = fields[part];
      field.addEventListener("focus", () => field.select());
      field.addEventListener("input", () => {
        field.value = sanitizeDatePart(field.value, part);
        syncNativeValue();
        if (field.value.length === DATE_PART_LENGTHS[part] && index < DATE_PARTS.length - 1) {
          fields[DATE_PARTS[index + 1]].focus();
        }
      });
      field.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !field.value && index > 0) {
          event.preventDefault();
          fields[DATE_PARTS[index - 1]].focus();
        }
      });
      field.addEventListener("paste", (event) => {
        const parts = parsePastedDate(event.clipboardData?.getData("text") || "");
        if (!parts) return;
        event.preventDefault();
        setValue(`${parts.year}-${parts.month}-${parts.day}`);
        fields.day.focus();
      });
    });

    nativeInput.addEventListener("change", () => setValue(nativeInput.value));
    setValue(nativeInput.value);

    return Object.freeze({
      getValue: () => nativeInput.value,
      setValue,
      focus: () => fields.year.focus()
    });
  }

  globalScope.SeungjinSegmentedDate = Object.freeze({
    composeDateValue,
    createController,
    parsePastedDate,
    sanitizeDatePart,
    splitDateValue
  });
}(globalThis));
