const passwordInput = document.querySelector("#password");
const showPasswordButton = document.querySelector(".show-password");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const loginButton = document.querySelector(".login-button");
const loginButtonLabel = document.querySelector(".login-button-label");
const loginButtonIcon = document.querySelector(".login-button-icon");
const accountIdInput = document.querySelector("#accountId");
const loginFields = {
  accountId: document.querySelector('[data-login-field="accountId"]'),
  password: document.querySelector('[data-login-field="password"]')
};

const API_URL = window.SEUNGJIN_CONFIG?.API_URL || "https://script.google.com/macros/s/AKfycbyPiTM2wEZ5d549g0R8pqLQB2FKE0Hz-7h_GYGfA_MVUq45-F3tTyITbT4A-yJ1ZldOCA/exec";

showPasswordButton.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  showPasswordButton.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
  showPasswordButton.querySelector("i")?.classList.toggle("ti-eye", !shouldShow);
  showPasswordButton.querySelector("i")?.classList.toggle("ti-eye-off", shouldShow);
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLogin();
});

[
  ["accountId", accountIdInput],
  ["password", passwordInput]
].forEach(([name, input]) => {
  input.addEventListener("input", () => {
    updateFieldState(name, input.value.trim());
    if (accountIdInput.value.trim() && passwordInput.value.trim()) {
      setMessage("");
    }
  });
});

async function handleLogin() {
  const accountId = accountIdInput.value.trim();
  const password = passwordInput.value.trim();

  setMessage("");
  updateFieldState("accountId", accountId, !accountId);
  updateFieldState("password", password, !password);

  if (!accountId || !password) {
    setMessage("계정 ID와 비밀번호를 확인해주세요.");
    const firstInvalidInput = !accountId ? accountIdInput : passwordInput;
    firstInvalidInput.focus();
    return;
  }

  if (!API_URL) {
    setMessage("로그인 API 주소가 아직 설정되지 않았습니다.");
    return;
  }

  loginButton.disabled = true;
  loginButton.classList.add("is-loading");
  loginButtonLabel.textContent = "확인 중";
  loginButtonIcon.className = "ti ti-loader-2 login-button-icon";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "login",
        payload: {
          accountId,
          password
        }
      })
    });
    const result = await response.json();
    const loginResult = result.data || result;

    if (!result.ok || !loginResult.success) {
      setMessage(loginResult.message || result.message || "로그인에 실패했습니다.");
      return;
    }

    sessionStorage.setItem("seungjinAdminSession", JSON.stringify(loginResult.user));
    setMessage(loginResult.message || "로그인되었습니다.", "success");
    window.location.href = "./admin.html";
  } catch (error) {
    setMessage("로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    loginButton.disabled = false;
    loginButton.classList.remove("is-loading");
    loginButtonLabel.textContent = "로그인";
    loginButtonIcon.className = "ti ti-arrow-right login-button-icon";
  }
}

function updateFieldState(name, value, showError = false) {
  const field = loginFields[name];
  const input = name === "accountId" ? accountIdInput : passwordInput;
  const isValid = Boolean(value);

  field.classList.toggle("is-valid", isValid);
  input.setAttribute("aria-invalid", showError ? "true" : "false");

  if (!showError) {
    field.classList.remove("is-invalid");
    return;
  }

  field.classList.remove("is-invalid");
  void field.offsetWidth;
  field.classList.add("is-invalid");
}

function setMessage(message, type = "error") {
  loginMessage.textContent = message;
  loginMessage.classList.toggle("success", type === "success");
}
