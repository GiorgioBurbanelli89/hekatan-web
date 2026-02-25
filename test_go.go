package main
import (
    "fmt"
    "math"
)
func main() {
    xi := []float64{0.125, 0.2, 0.25, 0.5, 0.707, 1.0, 2.0}
    fmt.Println("  DMF Go")
    for _, x := range xi {
        d := 1.0 / (2.0 * x)
        _ = math.Sqrt(d)
        fmt.Printf("  %-9.3f| %.4f\n", x, d)
    }
}
