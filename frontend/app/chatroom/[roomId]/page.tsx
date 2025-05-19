"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

export default function ChatRoomWithUserPage() {
  const [showMenu, setShowMenu] = useState(false); // 👈 控制菜单显示
  const router = useRouter();
  const params = useParams(); // 不要馬上解構，取得 url 裡的變數

  const [checking, setChecking] = useState(true); // 用於 loading 部分
  const [users, setUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // 點擊用戶後建立房間並跳轉
  const handleUserClick = async (targetUser: string) => {
    const currentUser = sessionStorage.getItem("currentUser");
    const token = sessionStorage.getItem("token");
    if (!currentUser || !token) return;

    const res = await fetch("http://localhost:8081/get-or-create-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user1: currentUser, user2: targetUser }),
    });

    const data = await res.json();
    const actualRoomId = data.room_id;
    router.push(`/chatroom/${actualRoomId}/${targetUser}`);
  };

  // 登入驗證並取得所有使用者清單
  useEffect(() => {
    const token = sessionStorage.getItem("token");
    const sessionUser = sessionStorage.getItem("currentUser");

    if (!token || !sessionUser) {
      router.push("/login");
      return;
    }

    setCurrentUser(sessionUser);

    fetch("http://localhost:8081/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data: { users: string[] }) => {
        setUsers(data.users);
        setChecking(false);
      })
      .catch((err) => {
        console.error("获取用户失败：", err);
        setError(err.message || "加载失败");
        setChecking(false);
      });
  }, [router]);

  if (checking || currentUser === null) {
    return <div className="h-screen flex justify-center items-center">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* 共通ヘッダー */}
      <div
        className="flex justify-between items-center bg-white p-4 border-b shadow-sm h-20"
        style={{ backgroundColor: "#f5fffa" }}
      >
        <h2 className="absolute left-1/2 transform -translate-x-1/2 text-lg text-[#2e8b57] font-semibold">LINECHAT</h2>
        <div></div>
        <div className="relative">
          <img
            src="/window.svg"
            alt="My Avatar"
            className="w-8 h-8 rounded-full cursor-pointer"
            onClick={() => setShowMenu((prev) => !prev)}
          />
          {showMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg z-10">
              <button onClick={() => router.push("/")} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
                ホームページ
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem("token");
                  router.push("/login");
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-500"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 左側：使用者列表 */}
        <div className="w-1/4 p-4 flex flex-col min-h-0" style={{ backgroundColor: "#2e8b57" }}>
          <h2 className="text-xl text-white font-bold mb-4 text-center">ユーザー一覧</h2>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1">
            <ul className="space-y-3 w-2/3 mx-auto">
              {users
                .filter((user) => user !== currentUser) // ✅ 過濾掉自己
                .map((user) => (
                  <li
                    key={user}
                    onClick={() => handleUserClick(user)}
                    className="p-2 bg-white rounded shadow hover:bg-gray-200 flex justify-center items-center mx-auto cursor-pointer"
                  >
                    {user}
                  </li>
                ))}
            </ul>
          </div>
        </div>

        {/* 右側：提示文字區 */}
        <div className="w-3/4 bg-white flex items-center justify-center">
          <h2 className="text-lg text-[#2e8b57] font-semibold">ユーザーを選んでください</h2>
        </div>
      </div>
    </div>
  );
}
