"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface RoomInfo {
  id: number;
  room_name: string;
  is_group: boolean;
}

export default function ChatRoomListPage() {
  const [showMenu, setShowMenu] = useState(false);
  const [groupRooms, setGroupRooms] = useState<RoomInfo[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);

  const oneToOneRooms = [
    { label: "ルーム1", id: 1 }
  ];

  const defaultGroupNames = ["ルーム1", "ルーム2", "ルーム3"];

  // ✅ 初始化：從後端獲取所有已存在的 group 房間，對照預設名稱，取得未讀訊息
  const fetchRoomsAndUnreadCounts = async () => {
    if (!token) return;
    const res = await fetch("http://localhost:8081/rooms", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;
    const allRooms: RoomInfo[] = await res.json();
    if (!Array.isArray(allRooms)) return;///確保是陣列

    const matchedRooms: RoomInfo[] = allRooms.filter(
      room => defaultGroupNames.includes(room.room_name) && room.is_group
    );

    setGroupRooms(matchedRooms);

    const counts: Record<number, number> = {};//一個以 K 為 key、V 為 value 的對應表（map 或 dictionary）
    for (const room of matchedRooms) {
      const res = await fetch(`http://localhost:8081/rooms/${room.id}/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      counts[room.id] = data.unread_count;////counts = {101: 5,102: 2,103: 0}
    }
    setUnreadCounts(counts);
  };

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setToken(token);
  }, [router]);

  useEffect(() => {
    if (token) {
      fetchRoomsAndUnreadCounts();
      const interval = setInterval(fetchRoomsAndUnreadCounts, 5000); // 每 10 秒輪詢一次
      return () => clearInterval(interval);
    }
  }, [token]);

  const handleDefaultGroupClick = async (roomName: string) => {
    if (!token) return;
    //find是用來找第一個符合條件的，existing 就會是：{ id: 1, room_name: 'general', is_group: true }
    let existing = groupRooms.find((r) => r.room_name === roomName);
    if (existing) {
      ///// prev是React state 的「前一個狀態」值。...prev是展開舊狀態的所有 key-value，意思是「保留所有現有房間的未讀數」：
      ///[existing.id]: 0是用來覆蓋（或新增）這個房間 ID 的未讀數為 0。
      setUnreadCounts((prev) => ({ ...prev, [existing.id]: 0 })); // 點擊後立即清除紅點
      router.push(`/chatroom/group?room_id=${existing.id}`);
      return;
    } else {
      // 尚未建立則立即建立後跳轉
      const res = await fetch("http://localhost:8081/create-group-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          room_name: roomName,
          user_ids: [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/chatroom/group?room_id=${data.room_id}`);
      } else {
        alert("群組建立失敗");
      }
    }
  };

  useEffect(() => {
    if (!token) return;

    // 避免重複建立
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket("ws://localhost:8081/ws?room_id=0"); // 用 room_id=0 代表全局 / 未進房
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket 連線成功（首頁）");
    };

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      console.log("📩 收到 WebSocket 訊息（首頁）:", parsed);

      // 👉 可後續處理全局通知，例如：
      // if (parsed.type === "new_message" && parsed.room_id && parsed.content) {
      //   showNotification(parsed.content); 或紅點更新
      // }
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket 關閉（首頁）");
    };

    return () => {
      ws.close(); // 使用者切換頁面或離開時，自動清除
    };
  }, [token]);


  const handleNewGroupClick = async () => {
    if (!token) return;
    const nextIndex = groupRooms.length + 1;
    const newName = `ルーム${nextIndex + 3}`;

    const res = await fetch("http://localhost:8081/create-group-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        room_name: newName,
        user_ids: [],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/chatroom/${data.room_id}/group`);
    } else {
      alert("群組建立失敗");
    }
  };

  const handleRoomClick = (roomId: number) => {
    const room = groupRooms.find((r) => r.id === roomId);
    if (room && room.is_group) {
      router.push(`/chatroom/group?room_id=${room.id}`);
    } else {
      router.push(`/chatroom/${roomId}`);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="relative bg-white p-4 border-b shadow-sm h-20 flex items-center justify-center" style={{ backgroundColor: "#f5fffa" }}>
        <h2 className="text-lg text-[#2e8b57] font-semibold">チャットルーム一覧</h2>
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
          <img
            src="/window.svg"
            alt="My Avatar"
            className="w-8 h-8 rounded-full cursor-pointer"
            onClick={() => setShowMenu((prev) => !prev)}
          />
          {showMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg z-10">
              <button onClick={() => router.push("/")} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">ホームページ</button>
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

      <div className="flex-1 flex p-6 bg-white overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto">
          <h3 className="text-lg text-[#2e8b57] font-bold mb-2">一対一</h3>
          <div className="bg-gray-100 rounded p-4 shadow mb-6" style={{ backgroundColor: "#2e8b57" }}>
            <h4 className="text-md font-semibold text-white mb-3">一対一ルーム</h4>
            <ul className="space-y-3">
              {oneToOneRooms.map((room) => (
                <li
                  key={room.id}
                  onClick={() => handleRoomClick(room.id)}
                  className="p-4 bg-white rounded shadow hover:bg-gray-200 cursor-pointer text-[#2e8b57]"
                >
                  {room.label}
                </li>
              ))}
            </ul>
          </div>

          <h3 className="text-lg text-[#2e8b57] font-bold mb-2">グループ</h3>
          <div className="bg-gray-100 rounded p-4 shadow" style={{ backgroundColor: "#2e8b57" }}>
            <h4 className="text-md font-semibold text-white mb-3 flex justify-between items-center">
              グループルーム
              <button
                onClick={handleNewGroupClick}
                className="bg-white text-[#2e8b57] px-2 py-1 text-sm rounded shadow hover:bg-gray-100"
              >
                + 新規作成
              </button>
            </h4>
            <ul className="space-y-3">
              {defaultGroupNames.map((name) => {
                const room = groupRooms.find((r) => r.room_name === name);
                const hasUnread = room && unreadCounts[room.id] > 0;
                return (
                  <li
                    key={name}
                    onClick={() => handleDefaultGroupClick(name)}
                    className="relative p-4 bg-white rounded shadow hover:bg-gray-200 cursor-pointer text-[#2e8b57]"
                  >
                    {name}
                    {hasUnread && (
                      <span className="absolute right-3 top-3 w-2.5 h-2.5 bg-red-500 rounded-full shadow"></span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
