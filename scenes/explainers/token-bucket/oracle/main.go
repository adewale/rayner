// The token-bucket explainer's ten requests, answered by golang.org/x/time/rate, for its
// model.test.ts. Rayner's model is not run here; the test compares it with this file.
//
//	cd scenes/explainers/token-bucket/oracle && go run . > ../fixtures/token-bucket-xtime.json
//
// rate.NewLimiter(r, 5) is a token bucket of size 5, initially full and refilled at r tokens
// a second. AllowN takes the arrival time, so the schedule runs on a fixed clock.
package main

import (
	"encoding/json"
	"os"
	"strconv"
	"time"

	"golang.org/x/time/rate"
)

// Seconds after the first request, as the explainer schedules them.
var schedule = []float64{0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5}

type call struct {
	At     float64 `json:"at"`
	Status int     `json:"status"`
	// Tokens the limiter holds just after answering.
	Tokens float64 `json:"tokens"`
}

func main() {
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	runs := map[string][]call{}
	for _, r := range []int{1, 2, 4} {
		lim := rate.NewLimiter(rate.Limit(r), 5)
		calls := []call{}
		for _, s := range schedule {
			t := start.Add(time.Duration(s * float64(time.Second)))
			status := 429
			if lim.AllowN(t, 1) {
				status = 200
			}
			calls = append(calls, call{At: s, Status: status, Tokens: lim.TokensAt(t)})
		}
		runs[strconv.Itoa(r)] = calls
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(map[string]any{
		"module":   "golang.org/x/time v0.15.0",
		"burst":    5,
		"schedule": schedule,
		"runs":     runs,
	}); err != nil {
		panic(err)
	}
}
