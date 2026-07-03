const passwordInput = document.querySelector("#password");
const showPasswordButton = document.querySelector(".show-password");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const loginButton = document.querySelector(".login-button");

const API_URL = window.SEUNGJIN_CONFIG?.API_URL || "https://script.google.com/macros/s/AKfycbyPiTM2wEZ5d549g0R8pqLQB2FKE0Hz-7h_GYGfA_MVUq45-F3tTyITbT4A-yJ1ZldOCA/exec";

showPasswordButton.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  showPasswordButton.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLogin();
});

async function handleLogin() {
  const accountId = document.querySelector("#accountId").value.trim();
  const password = passwordInput.value.trim();

  setMessage("");

  if (!accountId || !password) {
    setMessage("계정ID와 비밀번호를 입력해주세요.");
    return;
  }

  if (!API_URL) {
    setMessage("로그인 API 주소가 아직 설정되지 않았습니다.");
    return;
  }

  loginButton.disabled = true;

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
  }
}

function setMessage(message, type = "error") {
  loginMessage.textContent = message;
  loginMessage.classList.toggle("success", type === "success");
}
