package middleware

import (
	"backend/utils"
	"net/http"
	"strings"
)

func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ✅ ホワイトリストのパス（サインアップ・ログイン）は検証不要
		if r.URL.Path == "/signup" || r.URL.Path == "/login" {
			next.ServeHTTP(w, r) //// 検証通過後に元の処理を実行する
			//////// 例：/messages → SendMessageHandler に進む
			//////// /users → UsersHandler に進む
			return
		}

		// ✅ トークン文字列を初期化
		var tokenString string

		// ✅ Cookie から取得を試みる（推奨）
		cookie, err := r.Cookie("token")
		if err == nil {
			tokenString = cookie.Value
		} else {
			// ⚠️ Cookie がない場合は Authorization ヘッダーをチェック
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, "トークンが提供されていません", http.StatusUnauthorized) // 未提供 Token
				return
			}
			tokenString = strings.TrimPrefix(authHeader, "Bearer ") // プレフィックス削除
		}

		// ✅ トークン検証
		_, err = utils.ValidateJWT(tokenString)
		if err != nil {
			http.Error(w, "トークンが無効または期限切れです", http.StatusUnauthorized) // Token 无效或已过期
			return
		}

		// ✅ 検証成功、次のハンドラーへ
		next.ServeHTTP(w, r)
	})
}
