"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

interface RoomInfo {
  id: number;
  room_name: string;
  is_group: boolean;
}

export default function ChatRoomWithUserPage() {
  const [showMenu, setShowMenu] = useState(false); // 👈 控制菜单显示
  const router = useRouter();
  const params = useParams(); // 不要馬上解構，取得 url 裡的變數

  const [checking, setChecking] = useState(true); // 用於 loading 部分
  const [users, setUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [userToRoomIdMap, setUserToRoomIdMap] = useState<Record<string, number>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [groupRooms, setGroupRooms] = useState<RoomInfo[]>([]);


  // 點擊用戶後建立房間並跳轉
  const handleUserClick = async (targetUser: string) => {
    const currentUser = sessionStorage.getItem("currentUser");
    const token = sessionStorage.getItem("token");
    
    if (!token || !currentUser) {
      router.push("/login");
      return;
    }

    setCurrentUser(currentUser);
    setToken(token); // 👈 這行一定要加上

    

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
    const currentUser = sessionStorage.getItem("currentUser");

    if (!token || !currentUser) {
      router.push("/login");
      return;
    }

    setCurrentUser(currentUser);
    setToken(token); // ✅ 這一行必加！

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
  
  useEffect(() => {
    if (!token || !currentUser) return;
    console.log("💡 WebSocket 啟動條件: token =", token, "currentUser =", currentUser);

    console.log("🛰️ 嘗試建立 WebSocket 連線...", currentUser);

    const ws = new WebSocket(`ws://localhost:8081/ws?user=${currentUser}`);

    ws.onopen = () => {
      console.log("✅ WebSocket 連線成功");
    };

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      console.log("📨 收到 WebSocket 訊息：", parsed);

      if (parsed.type === "new_unread" && parsed.room_id && parsed.unread_count !== undefined) {
        console.log("🔴 設定房間", parsed.room_id, "未讀數：", parsed.unread_count);
        setUnreadCounts((prev) => ({
          ...prev,
          [parsed.room_id]: parsed.unread_count,
        }));
      }
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket 發生錯誤：", err);
    };

    ws.onclose = () => {
      console.warn("🔌 WebSocket 已關閉");
    };

    return () => ws.close();
  }, [token, currentUser]);


  const fetchRoomsAndUnreadCounts = async () => {
      if (!token) return;
  
      const res = await fetch("http://localhost:8081/oneroom", {
        headers: { Authorization: `Bearer ${token}` },
      });
  
      if (!res.ok) throw new Error('获取房间失败');
      const allRooms: RoomInfo[] = await res.json();
  
      if (!Array.isArray(allRooms)) return;  // 确保是数组
  
      const matchedRooms: RoomInfo[] = allRooms.filter(
         (room) => room.is_group === false // 筛选一对一房间
      );
  
      setGroupRooms(matchedRooms);
      /////////////////////////////////////////
      const userToRoomId: Record<string, number> = {};
  
      for (const room of matchedRooms) {
        const parts = room.room_name.split("_");
        const otherUser = parts.find((name) => name !== currentUser);
        if (otherUser) {
          userToRoomId[otherUser] = room.id;
        }
      }
  
      setUserToRoomIdMap(userToRoomId); // 你要加上 useState
  /////////////////////////////////////////
      
      const counts: Record<number, number> = {};
      for (const room of matchedRooms) {
        const res = await fetch(`http://localhost:8081/rooms/${room.id}/unread-count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        console.log(`📥 房間 ${room.id} (${room.room_name}) 的未讀數是：`, data.unread_count);
        counts[room.id] = data.unread_count;
      }
      setUnreadCounts(counts);
    };
  
    useEffect(() => {
      if (token) {
        fetchRoomsAndUnreadCounts();
        const interval = setInterval(fetchRoomsAndUnreadCounts, 10000); // 每 10 秒輪詢一次
        return () => clearInterval(interval);
      }
    }, [token]);

    
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
                    className="relative p-2 bg-white rounded shadow hover:bg-gray-200 flex justify-center items-center mx-auto cursor-pointer"
                  >
                    {user}
                    {userToRoomIdMap[user] !== undefined && unreadCounts[userToRoomIdMap[user]] > 0 && (
                      <span className="absolute right-1 top-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow"></span>
                    )}
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
