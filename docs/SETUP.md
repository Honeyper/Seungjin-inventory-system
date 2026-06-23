# 승진 관리 시스템 작업 환경 세팅

이 문서는 집 Windows와 회사 Mac에서 같은 프로젝트를 이어서 작업하기 위한 기준 문서입니다.

## 프로젝트 주소

GitHub 저장소:

```text
https://github.com/Honeyper/---------.git
```

Google Sheets DB:

```text
https://docs.google.com/spreadsheets/d/1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI/edit
```

Google Apps Script:

```text
https://script.google.com/home/projects/1Fk0-HC_EFMXUbu-DcKoKXy2jkuFc1_rI7boX838uRjnntaXC7HYjik1U/edit
```

Apps Script project ID:

```text
1Fk0-HC_EFMXUbu-DcKoKXy2jkuFc1_rI7boX838uRjnntaXC7HYjik1U
```

Google Sheet ID:

```text
1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI
```

## 폴더 구조

```text
gas/
  Code.js
  appsscript.json

docs/
  SETUP.md

.clasp.json
.gitignore
README.md
```

## 기본 작업 흐름

작업 시작 전:

```bash
git pull
```

Apps Script 코드 수정:

```text
gas/Code.js
gas/appsscript.json
```

Apps Script에 반영:

```bash
clasp push --force
```

GitHub에 저장:

```bash
git status
git add .
git commit -m "작업 내용"
git push
```

VS Code에서는 Source Control 화면에서 `Commit` 후 `Push` 또는 `Sync Changes`를 눌러도 됩니다.

## 회사 Mac 최초 세팅

1. VS Code 설치

```text
https://code.visualstudio.com
```

2. Git 확인

```bash
git --version
```

Git이 없으면 Mac 안내에 따라 Xcode Command Line Tools를 설치합니다.

3. 저장소 clone

```bash
git clone https://github.com/Honeyper/---------.git
cd ---------
```

4. Node.js 설치 확인

```bash
node -v
npm -v
```

Node가 없으면 아래에서 LTS 버전을 설치합니다.

```text
https://nodejs.org
```

5. clasp 설치

```bash
npm install -g @google/clasp
```

6. clasp 로그인

```bash
clasp login
```

Google 계정은 Apps Script와 Google Sheet 접근 권한이 있는 계정을 사용합니다.

7. 연결 확인

```bash
clasp status
```

아래 파일이 보이면 정상입니다.

```text
gas/appsscript.json
gas/Code.js
```

8. Apps Script 반영 테스트

```bash
clasp push --force
```

Apps Script 웹 화면을 새로고침해서 `gas/Code.js` 내용이 보이면 정상입니다.

## 집 Windows 참고

이 PC에서는 휴대용 Node와 clasp가 `.tools/` 아래에 설치되어 있습니다. `.tools/`는 GitHub에 올리지 않습니다.

Windows에서 Apps Script에 push할 때:

```powershell
.\.tools\node-v20.20.2-win-x64\clasp.cmd push --force
```

Mac에서는 일반적으로 전역 설치한 `clasp` 명령을 그대로 사용합니다.

## 주의사항

- Apps Script 웹 편집기에서 직접 수정하지 말고 가능하면 VS Code의 `gas/Code.js`를 원본으로 사용합니다.
- 작업 시작 전에 항상 `git pull`을 먼저 합니다.
- 작업이 끝나면 `clasp push --force`로 Google Apps Script에 반영하고, `git commit` / `git push`로 GitHub에도 저장합니다.
- `.env`, 로그인 토큰, `.clasprc.json`, `.tools/`는 GitHub에 올리지 않습니다.
