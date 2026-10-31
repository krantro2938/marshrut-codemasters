package main

import (
	"bytes"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestSurveyStoresOnlyValidatedDemoAnswers(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	a := &app{db: db}
	if err := a.migrate("a-test-password-123"); err != nil {
		t.Fatal(err)
	}

	send := func(body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/api/survey", bytes.NewBufferString(body))
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		a.submitSurvey(w, r)
		return w
	}
	valid := `{"role":"initiator","frequency":"weekly","channel":"email","visibility":2}`
	first := send(valid, nil)
	if first.Code != 201 {
		t.Fatalf("valid answer: got %d, want 201", first.Code)
	}
	cookies := first.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "takt_survey" {
		t.Fatal("expected survey cookie")
	}
	if got := send(valid, cookies[0]).Code; got != 409 {
		t.Fatalf("repeat answer: got %d, want 409", got)
	}
	if got := send(`{"role":"initiator","frequency":"weekly","channel":"email","visibility":9}`, nil).Code; got != 400 {
		t.Fatalf("invalid score: got %d, want 400", got)
	}
	var count int
	var source string
	if err := db.QueryRow("SELECT COUNT(*), MAX(source) FROM survey_responses").Scan(&count, &source); err != nil {
		t.Fatal(err)
	}
	if count != 1 || source != "public_demo" {
		t.Fatalf("stored rows=%d source=%q, want one public_demo row", count, source)
	}
}
