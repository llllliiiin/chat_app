package handlers

import (
	"log"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
)

// Clients: 各ルームID（int）に対応する WebSocket 接続集合（map[*websocket.Conn]bool）
// Register: ユーザー接続を登録するためのチャネル
// Unregister: ユーザー切断を処理するためのチャネル
// Broadcast: メッセージを同一ルーム内のすべての接続に送信するためのチャネル
// Mutex: 複数スレッドから Clients を安全に操作するためのロック
type WebSocketHub struct {
	Clients    map[int]map[*websocket.Conn]bool // roomID -> 接続セット
	Register   chan ClientConn
	Unregister chan ClientConn
	Broadcast  chan WSMessage
	Mutex      sync.Mutex
}

type ClientConn struct {
	RoomID int
	Conn   *websocket.Conn
}

type WSMessage struct {
	RoomID int            `json:"room_id"`
	Data   map[string]any `json:"data"`
}

// WebSocket にアップグレードするための設定
var Upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WebSocketHub の初期化
func NewHub() *WebSocketHub {
	return &WebSocketHub{
		Clients:    make(map[int]map[*websocket.Conn]bool),
		Register:   make(chan ClientConn),
		Unregister: make(chan ClientConn),
		Broadcast:  make(chan WSMessage),
	}
}

// Run() は main プログラム内で呼び出され、登録・解除・ブロードキャストを監視する select ループを実行
func (hub *WebSocketHub) Run() {
	for {
		select {
		// Register チャネルから受信し、ユーザーをルーム接続マップに追加（ロック付き）
		case client := <-hub.Register:
			hub.Mutex.Lock()
			if hub.Clients[client.RoomID] == nil {
				hub.Clients[client.RoomID] = make(map[*websocket.Conn]bool)
			}
			hub.Clients[client.RoomID][client.Conn] = true
			hub.Mutex.Unlock()

		// Unregister チャネルから受信し、切断されたユーザーを削除
		case client := <-hub.Unregister:
			hub.Mutex.Lock()
			if conns, ok := hub.Clients[client.RoomID]; ok {
				delete(conns, client.Conn)
				client.Conn.Close()
			}
			hub.Mutex.Unlock()

		// Broadcast チャネルから受信したメッセージをルーム内すべての接続に送信
		// case msg := <-hub.Broadcast:
		// 	log.Printf("📣 Broadcasting to room %d: %+v", msg.RoomID, msg.Data) // ✅ 新增这一行
		// 	hub.Mutex.Lock()
		// 	for conn := range hub.Clients[msg.RoomID] {
		// 		if err := conn.WriteJSON(msg.Data); err != nil {
		// 			log.Println("🔴 WebSocket 書き込みに失敗:", err) // 寫入 WebSocket 失敗
		// 			conn.Close()
		// 			delete(hub.Clients[msg.RoomID], conn)
		// 		}
		// 	}
		// 	hub.Mutex.Unlock()
		case msg := <-hub.Broadcast:
			log.Printf("📣 Broadcasting to room %d: %+v", msg.RoomID, msg.Data)

			hub.Mutex.Lock()
			if msg.RoomID == 0 {
				// ✅ 广播给所有连接
				for _, conns := range hub.Clients {
					for conn := range conns {
						if err := conn.WriteJSON(msg.Data); err != nil {
							log.Println("🔴 WebSocket 書き込みに失敗:", err)
							conn.Close()
							delete(conns, conn)
						}
					}
				}
			} else {
				// ✅ 只广播给指定房间
				for conn := range hub.Clients[msg.RoomID] {
					if err := conn.WriteJSON(msg.Data); err != nil {
						log.Println("🔴 WebSocket 書き込みに失敗:", err)
						conn.Close()
						delete(hub.Clients[msg.RoomID], conn)
					}
				}
			}
			hub.Mutex.Unlock()
		}
	}
}

// WebSocket ハンドラー（HTTP を WebSocket にアップグレードし、Hub に登録）
func (s *Server) WebSocketHandler(hub *WebSocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID, _ := strconv.Atoi(r.URL.Query().Get("room_id"))
		conn, err := Upgrader.Upgrade(w, r, nil) // HTTP を WebSocket にアップグレード
		if err != nil {
			log.Println("❌ WebSocket アップグレード失敗:", err) // WebSocket 升級失敗
			return
		}
		// クライアントを Hub に登録
		client := ClientConn{RoomID: roomID, Conn: conn}
		hub.Register <- client

		// 接続からメッセージ読み取りを継続（読み取りが終了したら切断）
		for {
			var dummy map[string]any
			if err := conn.ReadJSON(&dummy); err != nil {
				hub.Unregister <- client
				break
			}
		}
	}
}
