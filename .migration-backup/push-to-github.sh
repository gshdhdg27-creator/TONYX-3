#!/bin/bash
# Скрипт для отправки изменений в GitHub

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "❌ Ошибка: секрет GITHUB_PERSONAL_ACCESS_TOKEN не найден"
  exit 1
fi

REPO_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/gshdhdg27-creator/TONYX-3.git"

echo "📦 Добавляем все изменения..."
git add .

echo "✏️  Введите описание изменений (commit message):"
read -r COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="Update from Replit"
fi

git commit -m "$COMMIT_MSG"

echo "🚀 Отправляем в GitHub..."
git push "$REPO_URL" HEAD:main 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Готово! Изменения отправлены в GitHub."
else
  echo "❌ Ошибка при отправке. Проверьте токен и права доступа."
fi
