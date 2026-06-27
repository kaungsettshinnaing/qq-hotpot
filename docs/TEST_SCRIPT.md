# QQ Hotpot BBQ — Manual Test Script

Test against: **https://app.qqhotpotbbq.com**  
Run after every deployment to verify no regressions.

Legend: ✅ Pass · ❌ Fail · ⚠️ Partial

---

## 1. Authentication

| # | Steps | Expected |
|---|---|---|
| 1.1 | Go to `/login`, enter wrong password | "Invalid credentials" error shown, no redirect |
| 1.2 | Login as `cashier / cashier123` | Redirected to `/cashier` |
| 1.3 | Navigate directly to `/admin` | Redirected to `/cashier` (no admin access) |
| 1.4 | Click **Logout** | Redirected to `/login`, session cleared |
| 1.5 | Login as `admin / admin123` | Redirected to `/admin` |
| 1.6 | Confirm navbar shows all modules for admin | Waiter · Kitchen · Cashier · Reports · Manager · Admin · My Account visible |

---

## 2. Waiter — Open Table & Order

Login as `waiter / waiter123` → `/waiter`

| # | Steps | Expected |
|---|---|---|
| 2.1 | Table grid loads | All areas shown, tables colour-coded (green = available) |
| 2.2 | Click any available table → enter **2 Adults, 0 Children** → Open Table | Redirected to `/waiter/session/[id]`, table now shows OCCUPIED (blue) on grid |
| 2.3 | On session page: click **Add Pot** → select BBQ → pick 1 flavour → Submit | Pot appears in list; if 2 adults: 1st pot is **Free** |
| 2.4 | Add a second pot (same flavour) | 2nd pot shows as **Paid** (beyond free allowance of 1 for 2 pax) |
| 2.5 | Set **Beer** qty to 2 → Save | Beer count updates on page |
| 2.6 | Set **Wastage** to 500g → Save | Wastage shows 500g |
| 2.7 | Click **Update Headcount** → change to 4 adults → Save | Free pot allowance recalculates (still 1 free for 4 pax at ratio 4) |
| 2.8 | Click **Void Pot** on the 2nd paid pot | Pot removed from list, kitchen notified |

---

## 3. Kitchen — Pot Tickets

Login as `kitchen / kitchen123` → `/kitchen`

| # | Steps | Expected |
|---|---|---|
| 3.1 | Pending pot ticket from step 2.3 appears | Table label, flavour, kind (BBQ) shown |
| 3.2 | Click **Delivered** on the ticket | Ticket moves to history section, disappears from pending |
| 3.3 | Go back to Waiter → Add another pot | Kitchen page updates automatically (Socket.IO) |
| 3.4 | Click **Unmute** in top bar | Beep sound plays if any pots are pending; confirm browser allows audio |

---

## 4. Cashier — Full Checkout Flow

Login as `cashier / cashier123` → `/cashier`

### 4.1 Open Shift

| # | Steps | Expected |
|---|---|---|
| 4.1.1 | If no shift open: amber "Start Shift" banner visible | Opening float shown (carried from previous shift or 0) |
| 4.1.2 | Click **Start Shift** | Redirect to `/cashier`; shift banner replaced with green sales stats |

### 4.2 Bill & Payment

| # | Steps | Expected |
|---|---|---|
| 4.2.1 | Click the open session (table from step 2) | `/cashier/checkout/[id]` opens; bill shows: 2 adults, 1 paid pot, 2 beer, 500g wastage |
| 4.2.2 | Verify bill maths: subtotal = (2×adult) + (1×pot) + (2×beer) + (500×wastage/g) | Numbers match admin-configured prices |
| 4.2.3 | Apply **FIXED discount** of 1,000 → reason "test discount" → Apply | Discount line appears; Total reduces by 1,000 |
| 4.2.4 | Remove discount → Remove | Discount line disappears; Total back to original |
| 4.2.5 | Select method **Cash** → enter amount **higher than balance** (e.g. balance+10,000) | **Change Due: 10,000 MMK** amber banner appears live (before submitting) |
| 4.2.6 | Clear amount, click **Exact (X)** button | Amount field fills with exact balance |
| 4.2.7 | Click **Add Payment** | Payment row appears; Balance = 0; Settle button turns green |
| 4.2.8 | Add a second partial payment: switch to **KBZPay**, enter 5,000 | Payment row added; Total paid = balance + 5,000; Change = 5,000 shown |
| 4.2.9 | Void the KBZPay payment (✕ button) | Payment row removed; Balance back to original |

### 4.3 Settle

| # | Steps | Expected |
|---|---|---|
| 4.3.1 | Ensure balance = 0 → click **Settle & Free Table** | Redirect to `/cashier/checkout/[id]?settled=1`; green "Bill settled" banner; table freed |
| 4.3.2 | Click **Print Receipt** | Print dialog opens; receipt section shows correctly (table, items, total, payment) |
| 4.3.3 | Navigate back to `/cashier` | Session no longer in open tables list |

### 4.4 Cash In Drawer

| # | Steps | Expected |
|---|---|---|
| 4.4.1 | On `/cashier`, check **Cash In Drawer** section | Start Balance + Cash Sales − Expenses = Expected |
| 4.4.2 | Cash Sales shows only CASH payment amount (not KBZPay) | e.g. if paid 40,000 cash: Cash = 40,000 |

### 4.5 Close Shift

| # | Steps | Expected |
|---|---|---|
| 4.5.1 | Click **Close Shift** → `/cashier/shift` | Shift totals shown: cash sales, KBZPay, other, total |
| 4.5.2 | Enter **Counted Cash** equal to Expected → Submit | Variance = 0 (green); shift moves to "Recent Closed Shifts" table |
| 4.5.3 | Enter a different counted cash (e.g. 1,000 less) | Variance = −1,000 (red) |

---

## 5. Cashier — Shift Handover

Login as `cashier / cashier123`, ensure shift is OPEN. Then logout.  
Login as `admin / admin123` → `/cashier`

| # | Steps | Expected |
|---|---|---|
| 5.1 | Visit `/cashier` as admin | Red **"Shift in progress — handover required"** banner; shows cashier name + open time |
| 5.2 | Visit `/cashier/shift` as admin | Same red handover banner; cannot open a new shift |
| 5.3 | Login back as cashier → close shift → logout | Shift closed |
| 5.4 | Login as admin → `/cashier` | Amber "Start Shift" banner; no handover warning |

---

## 6. Cashier — History Page

Login as `cashier / cashier123` → `/cashier` → click **History**

| # | Steps | Expected |
|---|---|---|
| 6.1 | History page loads at `/cashier/history` | Today's date pre-selected; settled sessions from step 4.3 appear |
| 6.2 | Each session row shows: table, opened, closed, pax, cash, total | Matches what was settled in step 4 |
| 6.3 | Daily totals footer row sums all columns | Grand total = sum of session totals |
| 6.4 | Click **Receipt** on a row | Opens `/cashier/checkout/[id]`; shows "Bill settled" banner |
| 6.5 | Change date to yesterday (or another day with no sessions) | "No closed tables on this date." message |

---

## 7. Cashier — Expenses

Login as `cashier / cashier123` → `/cashier/expenses`

| # | Steps | Expected |
|---|---|---|
| 7.1 | Add expense: category, amount 5,000, **CASH_DRAWER**, description "test" | Expense appears in list |
| 7.2 | Return to `/cashier` → Cash In Drawer | **− Cash Expenses: 5,000** shown; Expected reduces by 5,000 |
| 7.3 | Add another expense: same category, amount 2,000, **BANK_TRANSFER** | Bank transfer expense appears in list but does NOT affect Cash In Drawer |

---

## 8. Cashier — Tables & Reservations

Login as `cashier / cashier123` → `/cashier/tables`

| # | Steps | Expected |
|---|---|---|
| 8.1 | Floor map loads with all areas and tables | Tables colour-coded by status |
| 8.2 | Create reservation: name "Test Customer", party 3, time 1hr from now → Add | Reservation appears in Upcoming Reservations list |
| 8.3 | Click **Seat** on the reservation | Table opens a new session; redirected to waiter session page |
| 8.4 | Return to `/cashier/tables` | Table shows OCCUPIED |
| 8.5 | Create another reservation → click **Cancel** | Reservation removed from list |

---

## 9. Language Toggle

Login as any user → **My Account** → **Account**

| # | Steps | Expected |
|---|---|---|
| 9.1 | Language section visible below change password card | "English" and "မြန်မာ" buttons shown |
| 9.2 | Click **မြန်မာ** | Page reloads; UI switches to Burmese; "Shift" (not "ဆင်ဒ်") used in all shift-related labels |
| 9.3 | Click **English** | UI switches back to English |

---

## 10. Admin — Settings

Login as `admin / admin123` → `/admin/menu`

| # | Steps | Expected |
|---|---|---|
| 10.1 | Change Adult price to 25,000 → Save | Save button appears when value is dirty; row updates |
| 10.2 | Open waiter → start a new session with 2 adults | Bill shows 2 × 25,000 = 50,000 |
| 10.3 | Reset Adult price back to original → Save | Confirmed |
| 10.4 | Toggle **Tax** on (e.g. 5%) → Save | New sessions show tax line in bill |
| 10.5 | Toggle Tax off → Save | Tax line disappears from new bills |

---

## 11. Discount → Cash Sales Accuracy

> Verifies the `billTotal` change deduction fix.

| # | Steps | Expected |
|---|---|---|
| 11.1 | Open a new session (2 adults) | Bill = 2 × adult price |
| 11.2 | Apply a FIXED discount of 10,000 | Bill reduces by 10,000 |
| 11.3 | Enter CASH payment **20,000 more than balance** → Add Payment | Change Due banner shows 20,000 |
| 11.4 | Enter CASH payment for exact balance → Add Payment | Balance = 0; Change on first payment still shown |
| 11.5 | Settle session | Settled; billTotal stored = discounted total |
| 11.6 | Check `/cashier` Cash In Drawer — Cash Sales | Should reflect **discounted bill total only**, not the overpaid amount |

---

## 12. Reports

Login as `manager / manager123` → `/reports`

| # | Steps | Expected |
|---|---|---|
| 12.1 | Daily report loads | Today's sessions, revenue, pax count shown |
| 12.2 | Sales from test sessions in step 4 appear | Amounts match what was settled |

---

## Regression Checklist (quick smoke)

After any deployment, verify these haven't broken:

- [ ] Login/logout works
- [ ] Waiter can open a table and add pots
- [ ] Kitchen sees and delivers pots
- [ ] Cashier can take payment and settle
- [ ] Shift open → close flow works
- [ ] `/cashier/history` shows today's sessions
- [ ] Language toggle (EN/MY) works on My Account
- [ ] No raw i18n keys visible anywhere (e.g. `shift_handover_hint` showing as text)
- [ ] NavBar scrolls/wraps correctly on desktop
