"use client";
import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter(); // ページ遷移用

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async () => {
    try {
      const res = await fetch("http://localhost:8081/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // ✅ Cookie を有効にする
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        alert("ログイン成功！");
        setUsername("");
        setPassword("");
        // ✅ Cookie に token が保存されているため、sessionStorage は不要
        console.log("📦 login 応答:", data);
        console.log("✅ username:", data.username);
        router.push("/chatroom");
      } else {
        const errMsg = await res.text();
        alert("ログイン失敗：" + errMsg);
      }
    } catch (error) {
      alert("サーバー接続に失敗しました！");
      console.error("fetch error:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-2xl shadow-md w-full max-w-md relative">
        {/* 戻るボタン */}
        <button
          onClick={() => router.push("/")}
          className="absolute top-8 left-5 text-[#2e8b57] hover:text-green-800 transition"
          aria-label="Back to Home"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="text-3xl font-bold text-[#2e8b57] mb-6 text-center">ログイン</h1>

        <div className="space-y-4">
          <div className="text-left">
            <label className="block text-sm text-gray-700 mb-1">ユーザー名</label>
            <input
              type="text"
              value={username}
              ref={usernameInputRef}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  passwordInputRef.current?.focus(); // 🔁 ↓キーで切り替え
                }
              }}
              className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#2e8b57]"
            />
          </div>

          <div className="text-left">
            <label className="block text-sm text-gray-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              ref={passwordInputRef}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              onKeyUp={(e) => {
                if (e.key === "ArrowUp") {
                  usernameInputRef.current?.focus(); // 🔁 ↑キーで切り替え
                } else if (e.key === "Enter") {
                  handleLogin(); // ⏎ でログイン
                }
              }}
              className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#2e8b57]"
            />
          </div>
        </div>

        <p className="text-center text-gray-500 mt-6">WELCOME TO SIGN IN!</p>

        <button
          onClick={handleLogin}
          className="w-full mt-4 bg-[#2e8b57] text-white py-2 rounded hover:bg-green-700 transition"
        >
          ログインする
        </button>
      </div>
    </div>
  );
}
