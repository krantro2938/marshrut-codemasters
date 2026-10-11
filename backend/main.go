package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

type app struct {
	db           *sql.DB
	demoPassword string
}

type User struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}
type Step struct {
	ID          int64  `json:"id"`
	Position    int    `json:"position"`
	Name        string `json:"name"`
	Assignee    User   `json:"assignee"`
	Status      string `json:"status"`
	DueAt       string `json:"dueAt"`
	CompletedAt string `json:"completedAt,omitempty"`
	Note        string `json:"note,omitempty"`
}
type Activity struct {
	ID        int64  `json:"id"`
	Actor     string `json:"actor"`
	Action    string `json:"action"`
	Note      string `json:"note,omitempty"`
	CreatedAt string `json:"createdAt"`
}
type Request struct {
	ID          int64      `json:"id"`
	Title       string     `json:"title"`
	Type        string     `json:"type"`
	Description string     `json:"description"`
	Creator     User       `json:"creator"`
	Status      string     `json:"status"`
	CurrentStep int        `json:"currentStep"`
	CreatedAt   string     `json:"createdAt"`
	UpdatedAt   string     `json:"updatedAt"`
	CompletedAt string     `json:"completedAt,omitempty"`
	Steps       []Step     `json:"steps"`
	Activity    []Activity `json:"activity"`
}

func main() {
	password := os.Getenv("DEMO_PASSWORD")
	if len(password) < 12 {
		log.Fatal("DEMO_PASSWORD must be at least 12 characters")
	}
	path := env("DATABASE_PATH", "./data/marshrut.db")
	if err := os.MkdirAll(dir(path), 0700); err != nil {
		log.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;"); err != nil {
		log.Fatal(err)
	}
	a := &app{db: db, demoPassword: password}
	if err := a.migrate(password); err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { jsonOut(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/demo-access", func(w http.ResponseWriter, r *http.Request) {
		jsonOut(w, 200, map[string]string{"password": a.demoPassword})
	})
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/logout", a.logout)
	mux.HandleFunc("GET /api/me", a.me)
	mux.HandleFunc("GET /api/requests", a.listRequests)
	mux.HandleFunc("POST /api/requests", a.createRequest)
	mux.HandleFunc("GET /api/requests/{id}", a.getRequest)
	mux.HandleFunc("POST /api/requests/{id}/decision", a.decision)
	mux.HandleFunc("POST /api/requests/{id}/resubmit", a.resubmit)
	mux.HandleFunc("GET /api/metrics", a.metrics)
	server := &http.Server{Addr: ":" + env("PORT", "8080"), Handler: security(mux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("Marshrut API listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
func dir(p string) string {
	i := strings.LastIndex(p, "/")
	if i < 0 {
		return "."
	}
	return p[:i]
}
func now() string { return time.Now().UTC().Format(time.RFC3339) }
func jsonOut(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, code int, msg string) {
	jsonOut(w, code, map[string]string{"error": msg})
}
func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(dst); err != nil {
		fail(w, 400, "Некорректные данные запроса")
		return false
	}
	return true
}
func security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		if r.Method != "GET" && r.Method != "HEAD" {
			origin := r.Header.Get("Origin")
			if origin != "" {
				host := r.Host
				scheme := "http"
				if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
					scheme = "https"
				}
				if origin != scheme+"://"+host {
					fail(w, 403, "Недопустимый источник запроса")
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) migrate(password string) error {
	schema := []string{
		`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, password_hash TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, creator_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL, current_step INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT);`,
		`CREATE TABLE IF NOT EXISTS steps (id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, assignee_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL, due_at TEXT NOT NULL, completed_at TEXT, note TEXT, UNIQUE(request_id,position));`,
		`CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE, actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);`,
		`CREATE INDEX IF NOT EXISTS idx_requests_creator ON requests(creator_id);`,
		`CREATE INDEX IF NOT EXISTS idx_steps_assignee ON steps(assignee_id,status);`,
	}
	for _, q := range schema {
		if _, err := a.db.Exec(q); err != nil {
			return err
		}
	}
	var count int
	if err := a.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		var hash string
		if err := a.db.QueryRow("SELECT password_hash FROM users LIMIT 1").Scan(&hash); err != nil {
			return err
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
			return errors.New("DEMO_PASSWORD does not match existing demo accounts")
		}
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	users := []User{{1, "Елена Морозова", "initiator@marshrut.demo", "initiator"}, {2, "Максим Орлов", "manager@marshrut.demo", "manager"}, {3, "Анна Волкова", "legal@marshrut.demo", "legal"}, {4, "Ирина Соколова", "finance@marshrut.demo", "finance"}}
	for _, u := range users {
		if _, err = a.db.Exec("INSERT INTO users(id,name,email,role,password_hash) VALUES(?,?,?,?,?)", u.ID, u.Name, u.Email, u.Role, hash); err != nil {
			return err
		}
	}
	return a.seed()
}
func (a *app) seed() error {
	data := []struct {
		title, typ, desc string
		days             int
		approvals        int
	}{
		{"Закупка оборудования для медиалаборатории", "Закупка", "Демо-заявка: согласование закупки для учебного проекта.", -3, 1},
		{"Служебная записка по расписанию", "Служебная записка", "Демо-заявка: изменение расписания консультаций.", -1, 0},
		{"Договор на исследовательскую услугу", "Договор", "Демо-заявка: проверка условий договора.", -8, 3},
	}
	for _, v := range data {
		created := time.Now().UTC().AddDate(0, 0, v.days).Format(time.RFC3339)
		res, err := a.db.Exec("INSERT INTO requests(title,type,description,creator_id,status,current_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", v.title, v.typ, v.desc, 1, "in_progress", 0, created, created)
		if err != nil {
			return err
		}
		id, _ := res.LastInsertId()
		route := routeFor(v.typ)
		for i, role := range route {
			assignee := roleID(role)
			status := "pending"
			if i == 0 {
				status = "active"
			}
			due := time.Now().UTC().AddDate(0, 0, v.days+2+i*2).Format(time.RFC3339)
			if _, err = a.db.Exec("INSERT INTO steps(request_id,position,name,assignee_id,status,due_at) VALUES(?,?,?,?,?,?)", id, i, roleName(role), assignee, status, due); err != nil {
				return err
			}
		}
		if _, err = a.db.Exec("INSERT INTO activities(request_id,actor_id,action,created_at) VALUES(?,?,?,?)", id, 1, "created", created); err != nil {
			return err
		}
		for i := 0; i < v.approvals && i < len(route); i++ {
			t := time.Now().UTC().AddDate(0, 0, v.days+i+1).Format(time.RFC3339)
			if _, err = a.db.Exec("UPDATE steps SET status='approved',completed_at=? WHERE request_id=? AND position=?", t, id, i); err != nil {
				return err
			}
			if _, err = a.db.Exec("INSERT INTO activities(request_id,actor_id,action,created_at) VALUES(?,?,?,?)", id, roleID(route[i]), "approved", t); err != nil {
				return err
			}
			if i+1 < len(route) {
				_, err = a.db.Exec("UPDATE steps SET status='active' WHERE request_id=? AND position=?", id, i+1)
				if err != nil {
					return err
				}
			}
		}
		status := "in_progress"
		var completed any
		if v.approvals >= len(route) {
			status = "approved"
			completed = now()
		}
		if _, err = a.db.Exec("UPDATE requests SET status=?,current_step=?,completed_at=?,updated_at=? WHERE id=?", status, min(v.approvals, len(route)-1), completed, now(), id); err != nil {
			return err
		}
	}
	return nil
}
func routeFor(t string) []string {
	switch t {
	case "Договор":
		return []string{"legal", "finance", "manager"}
	case "Служебная записка":
		return []string{"manager", "legal"}
	default:
		return []string{"manager", "finance", "legal"}
	}
}
func roleID(role string) int {
	switch role {
	case "manager":
		return 2
	case "legal":
		return 3
	case "finance":
		return 4
	}
	return 1
}
func roleName(role string) string {
	switch role {
	case "manager":
		return "Руководитель"
	case "legal":
		return "Юридическая проверка"
	case "finance":
		return "Финансовое согласование"
	}
	return role
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (a *app) current(r *http.Request) (User, error) {
	c, err := r.Cookie("marshrut_session")
	if err != nil {
		return User{}, err
	}
	h := sha256.Sum256([]byte(c.Value))
	var u User
	err = a.db.QueryRow(`SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`, hex.EncodeToString(h[:]), now()).Scan(&u.ID, &u.Name, &u.Email, &u.Role)
	return u, err
}
func (a *app) require(w http.ResponseWriter, r *http.Request) (User, bool) {
	u, err := a.current(r)
	if err != nil {
		fail(w, 401, "Требуется вход")
		return User{}, false
	}
	return u, true
}
func cookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{Name: "marshrut_session", Value: value, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}
func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	var u User
	var hash string
	err := a.db.QueryRow("SELECT id,name,email,role,password_hash FROM users WHERE email=?", strings.ToLower(strings.TrimSpace(in.Email))).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		time.Sleep(300 * time.Millisecond)
		fail(w, 401, "Неверный логин или пароль")
		return
	}
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		fail(w, 500, "Ошибка входа")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw[:])
	sum := sha256.Sum256([]byte(token))
	expires := time.Now().UTC().Add(7 * 24 * time.Hour)
	if _, err := a.db.Exec("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", hex.EncodeToString(sum[:]), u.ID, expires.Format(time.RFC3339)); err != nil {
		fail(w, 500, "Ошибка входа")
		return
	}
	cookie(w, r, token, 7*24*3600)
	jsonOut(w, 200, u)
}
func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("marshrut_session"); err == nil {
		h := sha256.Sum256([]byte(c.Value))
		_, _ = a.db.Exec("DELETE FROM sessions WHERE token_hash=?", hex.EncodeToString(h[:]))
	}
	cookie(w, r, "", -1)
	jsonOut(w, 200, map[string]bool{"ok": true})
}
func (a *app) me(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r)
	if ok {
		jsonOut(w, 200, u)
	}
}

func (a *app) listRequests(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r)
	if !ok {
		return
	}
	q := `SELECT DISTINCT r.id FROM requests r LEFT JOIN steps s ON s.request_id=r.id WHERE (?='manager' OR r.creator_id=? OR s.assignee_id=?) ORDER BY r.updated_at DESC,r.id DESC`
	rows, err := a.db.Query(q, u.Role, u.ID, u.ID)
	if err != nil {
		fail(w, 500, "Не удалось получить заявки")
		return
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err != nil {
		fail(w, 500, "Не удалось получить заявки")
		return
	}
	items := make([]Request, 0, len(ids))
	for _, id := range ids {
		item, err := a.readRequest(id)
		if err == nil {
			items = append(items, item)
		}
	}
	jsonOut(w, 200, items)
}
func (a *app) getRequest(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, 404, "Заявка не найдена")
		return
	}
	item, err := a.readRequest(id)
	if err != nil {
		fail(w, 404, "Заявка не найдена")
		return
	}
	if !canView(u, item) {
		fail(w, 403, "Нет доступа к заявке")
		return
	}
	jsonOut(w, 200, item)
}
func canView(u User, item Request) bool {
	if u.Role == "manager" || item.Creator.ID == u.ID {
		return true
	}
	for _, s := range item.Steps {
		if s.Assignee.ID == u.ID {
			return true
		}
	}
	return false
}
func (a *app) readRequest(id int64) (Request, error) {
	var v Request
	var completed sql.NullString
	err := a.db.QueryRow(`SELECT r.id,r.title,r.type,r.description,r.status,r.current_step,r.created_at,r.updated_at,r.completed_at,u.id,u.name,u.email,u.role FROM requests r JOIN users u ON u.id=r.creator_id WHERE r.id=?`, id).Scan(&v.ID, &v.Title, &v.Type, &v.Description, &v.Status, &v.CurrentStep, &v.CreatedAt, &v.UpdatedAt, &completed, &v.Creator.ID, &v.Creator.Name, &v.Creator.Email, &v.Creator.Role)
	if err != nil {
		return v, err
	}
	if completed.Valid {
		v.CompletedAt = completed.String
	}
	v.Steps = []Step{}
	v.Activity = []Activity{}
	rows, err := a.db.Query(`SELECT s.id,s.position,s.name,s.status,s.due_at,s.completed_at,s.note,u.id,u.name,u.email,u.role FROM steps s JOIN users u ON u.id=s.assignee_id WHERE s.request_id=? ORDER BY s.position`, id)
	if err != nil {
		return v, err
	}
	for rows.Next() {
		var s Step
		var done, note sql.NullString
		if err = rows.Scan(&s.ID, &s.Position, &s.Name, &s.Status, &s.DueAt, &done, &note, &s.Assignee.ID, &s.Assignee.Name, &s.Assignee.Email, &s.Assignee.Role); err != nil {
			break
		}
		if done.Valid {
			s.CompletedAt = done.String
		}
		if note.Valid {
			s.Note = note.String
		}
		v.Steps = append(v.Steps, s)
	}
	rows.Close()
	if err != nil {
		return v, err
	}
	rows, err = a.db.Query(`SELECT a.id,u.name,a.action,a.note,a.created_at FROM activities a JOIN users u ON u.id=a.actor_id WHERE a.request_id=? ORDER BY a.id DESC`, id)
	if err != nil {
		return v, err
	}
	for rows.Next() {
		var x Activity
		var note sql.NullString
		if err = rows.Scan(&x.ID, &x.Actor, &x.Action, &note, &x.CreatedAt); err != nil {
			break
		}
		if note.Valid {
			x.Note = note.String
		}
		v.Activity = append(v.Activity, x)
	}
	rows.Close()
	return v, err
}
func (a *app) createRequest(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r)
	if !ok {
		return
	}
	var in struct {
		Title       string `json:"title"`
		Type        string `json:"type"`
		Description string `json:"description"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	if len([]rune(in.Title)) < 5 || len([]rune(in.Title)) > 120 || len([]rune(in.Description)) > 2000 {
		fail(w, 400, "Название: 5–120 символов; описание: до 2000 символов")
		return
	}
	if in.Type != "Закупка" && in.Type != "Договор" && in.Type != "Служебная записка" {
		fail(w, 400, "Выберите тип документа")
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		fail(w, 500, "Ошибка сохранения")
		return
	}
	defer tx.Rollback()
	t := now()
	res, err := tx.Exec("INSERT INTO requests(title,type,description,creator_id,status,current_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", in.Title, in.Type, in.Description, u.ID, "in_progress", 0, t, t)
	if err != nil {
		fail(w, 500, "Ошибка сохранения")
		return
	}
	id, _ := res.LastInsertId()
	for i, role := range routeFor(in.Type) {
		status := "pending"
		if i == 0 {
			status = "active"
		}
		due := time.Now().UTC().Add(time.Duration((i+1)*48) * time.Hour).Format(time.RFC3339)
		if _, err = tx.Exec("INSERT INTO steps(request_id,position,name,assignee_id,status,due_at) VALUES(?,?,?,?,?,?)", id, i, roleName(role), roleID(role), status, due); err != nil {
			fail(w, 500, "Ошибка сохранения")
			return
		}
	}
	if _, err = tx.Exec("INSERT INTO activities(request_id,actor_id,action,created_at) VALUES(?,?,?,?)", id, u.ID, "created", t); err != nil {
		fail(w, 500, "Ошибка сохранения")
		return
	}
	if err = tx.Commit(); err != nil {
		fail(w, 500, "Ошибка сохранения")
		return
	}
	item, _ := a.readRequest(id)
	jsonOut(w, 201, item)
}
func (a *app) decision(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, 404, "Заявка не найдена")
		return
	}
	var in struct {
		Decision string `json:"decision"`
		Note     string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Note = strings.TrimSpace(in.Note)
	if in.Decision != "approve" && in.Decision != "return" {
		fail(w, 400, "Некорректное решение")
		return
	}
	if in.Decision == "return" && len([]rune(in.Note)) < 3 {
		fail(w, 400, "Укажите причину возврата")
		return
	}
	if len([]rune(in.Note)) > 500 {
		fail(w, 400, "Комментарий слишком длинный")
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		fail(w, 500, "Ошибка решения")
		return
	}
	defer tx.Rollback()
	var current, assignee, total int
	var status string
	err = tx.QueryRow(`SELECT r.current_step,r.status,s.assignee_id,(SELECT COUNT(*) FROM steps WHERE request_id=r.id) FROM requests r JOIN steps s ON s.request_id=r.id AND s.position=r.current_step WHERE r.id=?`, id).Scan(&current, &status, &assignee, &total)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "Заявка не найдена")
		return
	}
	if err != nil {
		fail(w, 500, "Ошибка решения")
		return
	}
	if status != "in_progress" || assignee != int(u.ID) {
		fail(w, 403, "Сейчас не ваш этап согласования")
		return
	}
	t := now()
	if in.Decision == "return" {
		_, err = tx.Exec("UPDATE steps SET status='returned',completed_at=?,note=? WHERE request_id=? AND position=?", t, in.Note, id, current)
		if err == nil {
			_, err = tx.Exec("UPDATE requests SET status='returned',updated_at=? WHERE id=?", t, id)
		}
	} else {
		_, err = tx.Exec("UPDATE steps SET status='approved',completed_at=?,note=? WHERE request_id=? AND position=?", t, in.Note, id, current)
		if err == nil && current+1 < total {
			due := time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339)
			_, err = tx.Exec("UPDATE steps SET status='active',due_at=? WHERE request_id=? AND position=?", due, id, current+1)
			if err == nil {
				_, err = tx.Exec("UPDATE requests SET current_step=?,updated_at=? WHERE id=?", current+1, t, id)
			}
		} else if err == nil {
			_, err = tx.Exec("UPDATE requests SET status='approved',completed_at=?,updated_at=? WHERE id=?", t, t, id)
		}
	}
	if err == nil {
		action := "approved"
		if in.Decision == "return" {
			action = "returned"
		}
		_, err = tx.Exec("INSERT INTO activities(request_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?)", id, u.ID, action, in.Note, t)
	}
	if err != nil || tx.Commit() != nil {
		fail(w, 500, "Ошибка решения")
		return
	}
	item, _ := a.readRequest(id)
	jsonOut(w, 200, item)
}
func (a *app) resubmit(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, 404, "Заявка не найдена")
		return
	}
	var in struct {
		Description string `json:"description"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Description = strings.TrimSpace(in.Description)
	if len([]rune(in.Description)) > 2000 {
		fail(w, 400, "Описание слишком длинное")
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		fail(w, 500, "Ошибка повторной отправки")
		return
	}
	defer tx.Rollback()
	var creator int64
	var status string
	err = tx.QueryRow("SELECT creator_id,status FROM requests WHERE id=?", id).Scan(&creator, &status)
	if err != nil {
		fail(w, 404, "Заявка не найдена")
		return
	}
	if creator != u.ID || status != "returned" {
		fail(w, 403, "Повторная отправка недоступна")
		return
	}
	t := now()
	_, err = tx.Exec("UPDATE requests SET description=?,status='in_progress',current_step=0,updated_at=? WHERE id=?", in.Description, t, id)
	if err == nil {
		_, err = tx.Exec("UPDATE steps SET status='pending',completed_at=NULL,note=NULL WHERE request_id=?", id)
	}
	if err == nil {
		due := time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339)
		_, err = tx.Exec("UPDATE steps SET status='active',due_at=? WHERE request_id=? AND position=0", due, id)
	}
	if err == nil {
		_, err = tx.Exec("INSERT INTO activities(request_id,actor_id,action,created_at) VALUES(?,?,?,?)", id, u.ID, "resubmitted", t)
	}
	if err != nil || tx.Commit() != nil {
		fail(w, 500, "Ошибка повторной отправки")
		return
	}
	item, _ := a.readRequest(id)
	jsonOut(w, 200, item)
}
func (a *app) metrics(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r)
	if !ok {
		return
	}
	if u.Role != "manager" {
		fail(w, 403, "Метрики доступны руководителю")
		return
	}
	var total, active, approved, returned, overdue int
	_ = a.db.QueryRow("SELECT COUNT(*),SUM(status='in_progress'),SUM(status='approved'),SUM(status='returned') FROM requests").Scan(&total, &active, &approved, &returned)
	_ = a.db.QueryRow("SELECT COUNT(*) FROM steps WHERE status='active' AND due_at<?", now()).Scan(&overdue)
	var avg sql.NullFloat64
	_ = a.db.QueryRow("SELECT AVG((julianday(completed_at)-julianday(created_at))*24) FROM requests WHERE status='approved'").Scan(&avg)
	mean := 0.0
	if avg.Valid {
		mean = avg.Float64
	}
	jsonOut(w, 200, map[string]any{"total": total, "active": active, "approved": approved, "returned": returned, "overdueStages": overdue, "averageHours": fmt.Sprintf("%.1f", mean)})
}
