const passwordInput = document.querySelector("#password");
const showPasswordButton = document.querySelector(".show-password");
const loginForm = document.querySelector("#loginForm");

showPasswordButton.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  showPasswordButton.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
});
