package handlers

import (
	"net/http"
)

// POST /logout
// Cookie（JWTトークン）を削除してログアウト処理を行う
func (s *Server) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	// クッキーを即時に無効化する（MaxAge = -1）
	http.SetCookie(w, &http.Cookie{
		Name:     "token", // JWTトークンが保存されているクッキー名
		Value:    "",      // 空文字で上書き
		Path:     "/",     // 有効なパス（全体）
		HttpOnly: true,    // JS からアクセスできないように
		MaxAge:   -1,      // 即時に期限切れにする
	})

	// オプション：current_user クッキーも削除（もしあれば）
	http.SetCookie(w, &http.Cookie{
		Name:   "current_user",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})

	// レスポンスステータスのみ返す（必要ならメッセージも）
	w.WriteHeader(http.StatusOK)
}
