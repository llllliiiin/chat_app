"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RoomInfo {
  id: number;
  room_name: string;
  is_group: boolean;
}

export default function ChatRoomWithUserPage() {
  const [showMenu, setShowMenu] = useState(false); // 👈 メニューの表示を制御
  const router = useRouter();
  const params = useParams();

  const [checking, setChecking] = useState(true); // ローディング表示制御用
  const [users, setUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [userToRoomIdMap, setUserToRoomIdMap] = useState<Record<string, number>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [groupRooms, setGroupRooms] = useState<RoomInfo[]>([]);

  // ユーザーをクリックしてルーム作成後チャットへ遷移
  const handleUserClick = async (targetUser: string) => {
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const res = await fetch("http://localhost:8081/get-or-create-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user1: currentUser, user2: targetUser }),
    });

    if (!res.ok) {
      console.error("❌ チャットルーム作成失敗");
      return;
    }

    const data = await res.json();
    const actualRoomId = data.room_id;

    setUnreadCounts((prev) => ({ ...prev, [data.room_id]: 0 }));

     // ✅ 告诉后端：该房间我已经进入，标记为已读
    await fetch(`http://localhost:8081/rooms/${data.room_id}/markread`, {
      method: "POST",
      credentials: "include",
    });


    router.push(`/chatroom/${actualRoomId}/${targetUser}`);
  };

  // 初期化：ログイン認証 & ユーザー一覧取得
  useEffect(() => {
    fetch("http://localhost:8081/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.username) {
          setCurrentUser(data.username);
          setCurrentUserId(data.user_id);
          fetch("http://localhost:8081/users", { credentials: "include" })
            .then(async (res) => {
              if (!res.ok) throw new Error(await res.text());
              return res.json();
            })
            .then((data: { users: string[] }) => {
              setUsers(data.users);
              setChecking(false);
            })
            .catch((err) => {
              console.error("ユーザー取得失敗：", err);
              setError(err.message || "読み込み失敗");
              setChecking(false);
            });
        }
      });
  }, [router]);

  useEffect(() => {
    console.log("✅ userToRoomIdMap 更新:", userToRoomIdMap);
  }, [userToRoomIdMap]);

  useEffect(() => {
    console.log("✅ unreadCounts 更新:", unreadCounts);
  }, [unreadCounts]);

  // WebSocket：通知・未読数更新
  useEffect(() => {
    if (!currentUser) return;

    const ws = new WebSocket(`ws://localhost:8081/ws?room_id=0`);

    ws.onopen = () => {
      console.log("✅ WebSocket 接続成功");
    };


    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      console.log("📩 WebSocket 收到:", parsed);

      if (
        parsed.type === "unread_update" &&
        parsed.unread_map &&
        parsed.room_id !== undefined &&
        currentUserId !== null
      ) {
        const count = parsed.unread_map[currentUserId];
        console.log("🧩 当前用户 ID:", currentUserId);
        console.log("📦 unread_map:", parsed.unread_map);
        console.log("🔍 对应 unread:", count);

        if (typeof count === "number") {
          console.log("✅ 准备写入 unreadCounts:", parsed.room_id, "=>", count);
          setUnreadCounts((prev) => ({
            ...prev,
            [parsed.room_id]: count,
          }));
        } else {
          console.warn("⚠️ 当前用户未出现在 unread_map 中");
        }
      }
    };



    ws.onerror = (err) => {
      console.error("❌ WebSocket エラー：", err);
    };

    ws.onclose = () => {
      console.warn("🔌 WebSocket 接続終了");
    };

    return () => ws.close();
  }, [currentUserId]);

  const fetchRoomUserMapping = async () => {
    const res = await fetch("http://localhost:8081/oneroom", {
      credentials: "include",
    });

    if (!res.ok) return;
    const allRooms: RoomInfo[] = await res.json();
    const matchedRooms = Array.isArray(allRooms)
      ? allRooms.filter((room) => room.is_group === false)
      : [];

    const userToRoomId: Record<string, number> = {};
    for (const room of matchedRooms) {
      const parts = String(room.room_name).split("_").map(s => s.trim()); // <-- 强制为字符串
      const otherUser = parts.find((name) => name !== currentUser);
      if (otherUser) {
        userToRoomId[otherUser.trim()] = room.id;
      }
      console.log("👤 currentUser =", currentUser);
      console.log("📦 room_name parts =", parts);
      console.log("👉 matched otherUser =", otherUser);
      if (otherUser) {
        userToRoomId[otherUser] = room.id;
      }
    }
    setUserToRoomIdMap(userToRoomId);
    console.log("🧾 所有已加入房间:", matchedRooms.map(r => `${r.room_name} = ${r.id}`));
    
  };
  // 既存ルーム & 未読数取得
  const fetchRoomsAndUnreadCounts = async () => {
    const res = await fetch("http://localhost:8081/oneroom", {
      credentials: "include",
    });

    if (!res.ok) throw new Error("ルームデータ取得失敗");
    const allRooms: RoomInfo[] = await res.json();
    if (!Array.isArray(allRooms)) return;

    const matchedRooms = allRooms.filter((room) => room.is_group === false);
    setGroupRooms(matchedRooms);

    const userToRoomId: Record<string, number> = {};
    for (const room of matchedRooms) {
      const parts = room.room_name.split("_");
      const otherUser = parts.find((name) => name !== currentUser);
      if (otherUser) {
        userToRoomId[otherUser] = room.id;
      }
    }
    setUserToRoomIdMap(userToRoomId);

    const counts: Record<number, number> = {};
    for (const room of matchedRooms) {
      const res = await fetch(`http://localhost:8081/rooms/${room.id}/unread-count`, {
        credentials: "include",
      });
      const data = await res.json();
      counts[room.id] = data.unread_count;
    }
    setUserToRoomIdMap(userToRoomId);
    setUnreadCounts(counts);
  };

  useEffect(() => {
    if (!currentUser) {
      console.debug("⏳ currentUser 尚未加载，等待中...");
      return;
    }
    fetchRoomUserMapping();
    fetchRoomsAndUnreadCounts(); 
    // fetchRoomsAndUnreadCounts();
    // const interval = setInterval(() => {
    //   if (currentUser) {
    //     fetchRoomsAndUnreadCounts();
    //   }
    // }, 5000);
    // return () => clearInterval(interval);
  }, [currentUser]);



  if (checking || currentUser === null) {
    return <div className="h-screen flex justify-center items-center">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* 共通ヘッダー */}
      <div
      className="relative flex justify-center items-center bg-white p-4 border-b shadow-sm h-20"
      style={{ backgroundColor: "#f5fffa" }}
    >
      {/* ← 戻るボタン（チャットルーム一覧へ） */}
      <button
        onClick={() => router.push("/chatroom")}
        className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#2e8b57] hover:text-green-800 transition"
        aria-label="Back to Room List"
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

      <h2 className="text-lg text-[#2e8b57] font-semibold">LINECHAT</h2>

      {/* 右側メニューアイコンそのまま保留 */}
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
              onClick={() => router.push("/login")}
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
                .filter((user) => user !== currentUser)
                .map((userRaw) => {
                  const user = userRaw.trim();
                  const roomId = userToRoomIdMap[user];
                  const unread = unreadCounts[roomId];

                  // 🔍 输出详细调试日志
                  console.log(
                    "🔍 user =", user,
                    "| roomId =", roomId,
                    "| unreadCounts =", unreadCounts,
                    "| 当前 unread =", unread
                  );

                  const showRedDot = roomId !== undefined && typeof unread === "number" && unread > 0;

                  return (
                    <li
                      key={user}
                      onClick={() => handleUserClick(user)}
                      className="bg-white text-[#2e8b57] rounded px-3 py-2 text-m text-center"
                    >
                      {user}
                      {showRedDot && (
                        <span className="absolute top-1 right-1 bg-red-500 text-white text-[11px] font-bold px-2 h-[20px] leading-[20px] rounded-[10px] shadow-sm min-w-[24px] text-center">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </li>
                  );
                })}

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
