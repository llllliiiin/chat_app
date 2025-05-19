"use client";
import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter(); // 声明变量
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleRegister = async () => {
    // 👉 加上空值判斷
    if (!username.trim() || !password.trim()) {
      alert("ユーザー名とパスワードは必須です！");
      return;
    }

    try {
      const res = await fetch("http://localhost:8081/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        alert("注册成功！");
        setUsername("");
        setPassword("");
        router.push("/login");
      } else if (res.status === 409) {
        alert("该用户名已存在，请直接登录！");
        router.push("/login");
      } else {
        const errMsg = await res.text();
        alert("注册失败！原因：" + errMsg);
      }
    } catch (error) {
      alert("连接服务器失败！");
      console.error("fetch error:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-2xl shadow-md w-full max-w-md relative">
        {/* 返回按鈕 */}
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

        <h1 className="text-3xl font-bold text-[#2e8b57] mb-6 text-center">サインアップ</h1>

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
                  passwordInputRef.current?.focus();
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
                  usernameInputRef.current?.focus();
                } else if (e.key === "Enter") {
                  handleRegister();
                }
              }}
              className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#2e8b57]"
            />
          </div>
        </div>

        <p className="text-center text-gray-500 mt-6">WELCOME TO SIGN UP!</p>

        <button
          onClick={handleRegister}
          className="w-full mt-4 bg-[#2e8b57] text-white py-2 rounded hover:bg-green-700 transition"
        >
          サインアップする
        </button>
      </div>
    </div>
  );
}
