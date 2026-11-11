const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const chartColors = ["#7567df","#47b98d","#f0a35e","#65a9d8","#e47e91","#9b8bdc","#8aa2b2"];
let transactions = [];
let editingId = null;
let monthlyChart = null;
let categoryChart = null;

const $ = (id) => document.getElementById(id);
const modal = $("modalBackdrop");
const form = $("transactionForm");

function showAlert(message, kind = "error") {
  const alert = $("alert");
  alert.textContent = message;
  alert.className = `alert ${kind}`;
  alert.hidden = false;
  window.clearTimeout(showAlert.timer);
  showAlert.timer = window.setTimeout(() => alert.hidden = true, 4500);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
async function refreshDashboard() {
  try {
    const [txs, summary] = await Promise.all([api("/api/transactions"), api("/api/summary")]);
    transactions = txs;
    $("totalIncome").textContent = currency.format(summary.totals.income);
    $("totalExpenses").textContent = currency.format(summary.totals.expenses);
    $("netBalance").textContent = currency.format(summary.totals.balance);
    $("netBalance").style.color = summary.totals.balance < 0 ? "#d66d65" : "#182230";
    renderTransactions();
    renderCharts(summary);
  } catch (error) {
    showAlert(error.message);
  }
}
function renderTransactions() {
  const query = $("searchInput").value.trim().toLowerCase();
  const sort = $("sortSelect").value;
  let rows = transactions.filter(tx =>
    [tx.date, tx.type, tx.category, tx.description].join(" ").toLowerCase().includes(query)
  );
  rows.sort((a,b) => {
    if (sort === "date-asc") return a.date.localeCompare(b.date) || a.id-b.id;
    if (sort === "amount-desc") return b.amount-a.amount;
    if (sort === "amount-asc") return a.amount-b.amount;
    return b.date.localeCompare(a.date) || b.id-a.id;
  });
  $("transactionRows").innerHTML = rows.map(tx => `
    <tr>
      <td><div class="transaction-name">${escapeHtml(tx.description || tx.category)}</div>
          ${tx.description ? `<div class="transaction-description">${escapeHtml(tx.category)}</div>` : ""}</td>
      <td>${new Date(`${tx.date}T00:00:00`).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</td>
      <td><span class="category-pill">${escapeHtml(tx.category)}</span></td>
      <td><span class="type-pill ${tx.type === "Income" ? "type-income" : "type-expense"}">${tx.type}</span></td>
      <td class="amount-cell ${tx.type === "Income" ? "amount-income" : ""}">${tx.type === "Income" ? "+" : "−"}${currency.format(tx.amount)}</td>
      <td class="actions-cell"><button class="action-btn" title="Edit transaction" aria-label="Edit transaction" data-edit="${tx.id}">✎</button><button class="action-btn" title="Delete transaction" aria-label="Delete transaction" data-delete="${tx.id}">⌫</button></td>
    </tr>`).join("");
  $("emptyState").hidden = rows.length !== 0;
  $("transactionCount").textContent = `${rows.length} transaction${rows.length === 1 ? "" : "s"}`;
}
function renderCharts(summary) {
  const monthly = summary.monthly;
  const categories = summary.categories;
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart($("monthlyChart"), {
    type: "bar",
    data: { labels: monthNames, datasets: [{ data: monthly.map(x => x.total), backgroundColor: "#786be0", hoverBackgroundColor: "#5747c8", borderRadius: 5, maxBarThickness: 27 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>currency.format(ctx.raw)}}}, scales:{x:{grid:{display:false},ticks:{color:"#9ba3b0",font:{size:10}},border:{display:false}},y:{beginAtZero:true,grid:{color:"#f0f2f6"},ticks:{color:"#a0a8b5",font:{size:9},callback:v=> "₹"+Number(v).toLocaleString("en-IN")},border:{display:false}}} }
  });
  if (categoryChart) categoryChart.destroy();
  const labels = categories.map(x => x.category);
  const values = categories.map(x => x.total);
  categoryChart = new Chart($("categoryChart"), {
    type:"doughnut",
    data:{labels,datasets:[{data:values,backgroundColor:labels.map((_,i)=>chartColors[i%chartColors.length]),borderWidth:3,borderColor:"#fff",hoverOffset:5}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"69%",plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${currency.format(ctx.raw)} (${(ctx.raw/(values.reduce((a,b)=>a+b,0)||1)*100).toFixed(1)}%)`}}}}
  });
  $("categoryLegend").innerHTML = categories.length ? categories.map((item,i)=>`<span class="legend-item"><i class="legend-dot" style="background:${chartColors[i%chartColors.length]}"></i>${escapeHtml(item.category)}</span>`).join("") : '<span class="legend-item">No expense data yet</span>';
}
function openModal(tx = null) {
  editingId = tx ? tx.id : null;
  $("modalTitle").textContent = tx ? "Edit transaction" : "Add transaction";
  $("saveBtn").textContent = tx ? "Save changes" : "Save transaction";
  $("date").value = tx ? tx.date : new Date().toISOString().slice(0,10);
  $("type").value = tx ? tx.type : "Expense";
  $("category").value = tx ? tx.category : "Food";
  if (tx && ![...$("category").options].some(o=>o.value===tx.category)) {
    $("category").add(new Option(tx.category, tx.category));
  }
  $("amount").value = tx ? tx.amount : "";
  $("description").value = tx ? tx.description : "";
  $("formError").hidden = true;
  modal.hidden = false;
  $("date").focus();
}
function closeModal() { modal.hidden = true; form.reset(); editingId = null; }
$("newTransactionBtn").addEventListener("click",()=>openModal());
$("closeModal").addEventListener("click",closeModal);
$("cancelModal").addEventListener("click",closeModal);
modal.addEventListener("click",e=>{if(e.target===modal)closeModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)closeModal();});
$("searchInput").addEventListener("input",renderTransactions);
$("sortSelect").addEventListener("change",renderTransactions);

form.addEventListener("submit", async e => {
  e.preventDefault();
  const payload = {
    date:$("date").value, type:$("type").value, category:$("category").value,
    amount:$("amount").value, description:$("description").value.trim()
  };
  const error = $("formError");
  if (!payload.date || !payload.type || !payload.category || payload.amount === "") {
    error.textContent = "Please complete all required fields.";
    error.hidden = false; return;
  }
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
    error.textContent = "Enter an amount greater than zero.";
    error.hidden = false; return;
  }
  payload.amount = Number(payload.amount);
  $("saveBtn").disabled = true;
  try {
    if (editingId) await api(`/api/transactions/${editingId}`,{method:"PUT",body:JSON.stringify(payload)});
    else await api("/api/transactions",{method:"POST",body:JSON.stringify(payload)});
    closeModal();
    await refreshDashboard();
    showAlert(editingId ? "Transaction updated." : "Transaction added.", "success");
  } catch (err) {
    error.textContent = err.message; error.hidden = false;
  } finally { $("saveBtn").disabled = false; }
});

$("transactionRows").addEventListener("click", async e => {
  const editButton = e.target.closest("[data-edit]");
  const deleteButton = e.target.closest("[data-delete]");
  if (editButton) {
    const tx = transactions.find(item=>item.id===Number(editButton.dataset.edit));
    if (tx) openModal(tx);
  }
  if (deleteButton) {
    const id = Number(deleteButton.dataset.delete);
    if (!confirm("Delete this transaction? This action cannot be undone.")) return;
    try { await api(`/api/transactions/${id}`,{method:"DELETE"}); await refreshDashboard(); showAlert("Transaction deleted.","success"); }
    catch(err) { showAlert(err.message); }
  }
});
refreshDashboard();
