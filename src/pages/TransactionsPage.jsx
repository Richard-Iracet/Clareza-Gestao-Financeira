import { useState } from "react";

import CategoryManager from "../components/Categories/CategoryManager";
import ConfirmDialog from "../components/Common/ConfirmDialog";
import ExpenseForm from "../components/Expenses/ExpenseForm";
import ExpenseList from "../components/Expenses/ExpenseList";
import FilterBar from "../components/Filters/FilterBar";
import { useFinance } from "../context/FinanceContext";
import { formatCurrency } from "../utils/currency";
import { getFilteredTotal } from "../utils/filtering";
import {
  getDeletionTargets,
  summarizeTransactions,
} from "../utils/transactionOperations";

const emptyBatch = {
  category: "",
  costCenter: "",
  necessity: "",
  status: "",
  notes: "",
};

export default function TransactionsPage() {
  const {
    transactions,
    filteredTransactions,
    filters,
    categories,
    invoices,
    deleteTransaction,
    bulkUpdateTransactions,
    bulkDeleteTransactions,
    togglePaid,
  } = useFinance();

  const [editing, setEditing] = useState(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [deletion, setDeletion] = useState(null);
  const [deleteScope, setDeleteScope] = useState("single");
  const [selected, setSelected] = useState([]);
  const [batchMode, setBatchMode] = useState(null);
  const [batchChanges, setBatchChanges] = useState(emptyBatch);
  const [feedback, setFeedback] = useState("");

  const remove = (item) => {
    setDeleteScope("single");
    setDeletion(item);
    setFeedback("");
  };

  const edit = (item) => {
    setEditing(item);
    setFeedback("");

    document
      .querySelector(".transaction-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleTogglePaid = (id) => {
    setFeedback("");

    const result = togglePaid(id);

    if (result?.success === false) {
      setFeedback(
        result.message || "Não foi possível alterar o status desse lançamento.",
      );

      return;
    }

    if (result?.persistencePending) {
      setFeedback(
        "Status alterado. A confirmação no armazenamento ainda está em andamento.",
      );

      return;
    }

    setFeedback("Status do lançamento atualizado com sucesso.");
  };

  const toggleSelection = (id) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const clearSelection = () => {
    setSelected([]);
    setBatchMode(null);
    setBatchChanges(emptyBatch);
  };

  const deletionItems = deletion
    ? getDeletionTargets(transactions, deletion.id, deleteScope)
    : [];

  const deletionSummary = summarizeTransactions(deletionItems, invoices);

  const selectedItems = transactions.filter((item) =>
    selected.includes(item.id),
  );

  const batchSummary = summarizeTransactions(selectedItems, invoices);

  const confirmDelete = () => {
    if (!deletion) {
      return;
    }

    const deletionId = deletion.id;
    const affectedItems = deletionItems;
    const result = deleteTransaction(deletionId, deleteScope);

    if (result?.success === false) {
      setFeedback(
        result.message ||
          "A operação ainda está aguardando confirmação no armazenamento.",
      );

      return;
    }

    if (editing && affectedItems.some((item) => item.id === editing.id)) {
      setEditing(null);
    }

    setSelected((current) =>
      current.filter((id) => !affectedItems.some((item) => item.id === id)),
    );

    setDeletion(null);
    setDeleteScope("single");

    if (result?.persistencePending) {
      setFeedback(
        result?.cancelledOccurrence
          ? "Ocorrência recorrente cancelada. A confirmação no armazenamento ainda está em andamento."
          : "Lançamento removido. A confirmação no armazenamento ainda está em andamento.",
      );

      return;
    }

    setFeedback(
      result?.cancelledOccurrence
        ? "Ocorrência recorrente cancelada. Ela não será recriada automaticamente."
        : "Lançamento excluído com sucesso.",
    );
  };

  const confirmBatch = () => {
    if (!batchMode || selected.length === 0) {
      return;
    }

    const currentBatchMode = batchMode;
    const selectedIds = [...selected];

    const result =
      currentBatchMode === "delete"
        ? bulkDeleteTransactions(selectedIds)
        : bulkUpdateTransactions(selectedIds, batchChanges);

    if (result?.success === false) {
      setFeedback(
        result.message ||
          "A operação ainda está aguardando confirmação no armazenamento.",
      );

      return;
    }

    if (
      currentBatchMode === "delete" &&
      editing &&
      selectedIds.includes(editing.id)
    ) {
      setEditing(null);
    }

    setSelected([]);
    setBatchMode(null);
    setBatchChanges(emptyBatch);

    if (result?.persistencePending) {
      setFeedback(
        currentBatchMode === "delete"
          ? "Lançamentos removidos. A confirmação no armazenamento ainda está em andamento."
          : "Alterações aplicadas. A confirmação no armazenamento ainda está em andamento.",
      );

      return;
    }

    setFeedback(
      result?.cancelledOccurrences
        ? "Ocorrências recorrentes canceladas. Elas não serão recriadas automaticamente."
        : currentBatchMode === "delete"
          ? "Lançamentos excluídos."
          : "Lançamentos atualizados.",
    );
  };

  const closeBatchDialog = () => {
    setBatchMode(null);
    setBatchChanges(emptyBatch);
  };

  return (
    <div className="page transactions-page">
      <section className="page-section">
        <div className="content-grid">
          <ExpenseForm editing={editing} onFinish={() => setEditing(null)} />

          <aside className="tip-card">
            <span aria-hidden="true">✦</span>

            <h3>Organize hoje, respire amanhã.</h3>

            <p>
              Classifique seus gastos para entender onde pequenas escolhas fazem
              diferença.
            </p>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setCategoriesOpen(true)}
            >
              Gerenciar categorias
            </button>
          </aside>
        </div>
      </section>

      <section className="page-section launches-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2>Lançamentos</h2>
          </div>

          <span className="result-count">
            {filteredTransactions.length}{" "}
            {filteredTransactions.length === 1 ? "lançamento" : "lançamentos"} ·{" "}
            {formatCurrency(getFilteredTotal(filteredTransactions))}
          </span>
        </div>

        <FilterBar />

        {feedback && (
          <p className="success-message" role="status">
            {feedback}
          </p>
        )}

        {filters.transferScope !== "only" && selected.length > 0 && (
          <div
            className="batch-toolbar"
            role="region"
            aria-label="Ações em lote"
          >
            <strong>{selected.length} selecionado(s)</strong>

            <button
              type="button"
              className="outline-button"
              onClick={() => setBatchMode("edit")}
            >
              Editar em lote
            </button>

            <button
              type="button"
              className="danger-button"
              onClick={() => setBatchMode("delete")}
            >
              Excluir em lote
            </button>

            <button
              type="button"
              className="text-button"
              onClick={clearSelection}
            >
              Cancelar seleção
            </button>
          </div>
        )}

        {filters.transferScope !== "only" && (
          <ExpenseList
            transactions={filteredTransactions}
            onEdit={edit}
            onDelete={remove}
            onToggle={handleTogglePaid}
            selected={selected}
            onSelect={toggleSelection}
          />
        )}

        {filters.transferScope === "only" && (
          <div className="empty-state">
            <span aria-hidden="true">◎</span>

            <h3>O filtro está configurado para mostrar transferências.</h3>

            <p>
              Nesta página são exibidos apenas lançamentos. Altere o filtro
              “Exibir transferências” para visualizar receitas e despesas.
            </p>
          </div>
        )}
      </section>

      {categoriesOpen && (
        <CategoryManager onClose={() => setCategoriesOpen(false)} />
      )}

      <ConfirmDialog
        open={Boolean(deletion)}
        title={
          deletion?.installmentGroupId
            ? "Excluir parcela"
            : "Excluir lançamento"
        }
        description={
          deletion
            ? `${deletion.description} · ${formatCurrency(
                deletion.amount,
              )} · ${deletion.date || deletion.dueDate}`
            : ""
        }
        impact={
          deletion ? (
            <dl className="compact-stats">
              <div>
                <dt>Registros afetados</dt>
                <dd>{deletionSummary.count}</dd>
              </div>

              <div>
                <dt>Valor total</dt>
                <dd>{formatCurrency(deletionSummary.total)}</dd>
              </div>

              <div>
                <dt>Faturas</dt>
                <dd>{deletionSummary.invoices}</dd>
              </div>

              <div>
                <dt>Pagos</dt>
                <dd>{deletionSummary.paid}</dd>
              </div>
            </dl>
          ) : null
        }
        confirmLabel="Excluir"
        danger
        critical={deletionSummary.paid > 0}
        onCancel={() => {
          setDeletion(null);
          setDeleteScope("single");
        }}
        onConfirm={confirmDelete}
      >
        {deletion?.installmentGroupId && (
          <fieldset className="scope-options">
            <legend>Quais parcelas excluir?</legend>

            <label>
              <input
                type="radio"
                name="deleteScope"
                checked={deleteScope === "single"}
                onChange={() => setDeleteScope("single")}
              />
              Somente esta parcela
            </label>

            <label>
              <input
                type="radio"
                name="deleteScope"
                checked={deleteScope === "future"}
                onChange={() => setDeleteScope("future")}
              />
              Esta e as próximas
            </label>

            <label>
              <input
                type="radio"
                name="deleteScope"
                checked={deleteScope === "group"}
                onChange={() => setDeleteScope("group")}
              />
              Todas as parcelas do grupo
            </label>
          </fieldset>
        )}

        {deletionSummary.paid > 0 && (
          <p className="critical-warning">
            A seleção contém registro pago ou vinculado a fatura paga. Revise o
            impacto antes de confirmar.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(batchMode)}
        title={
          batchMode === "delete"
            ? "Excluir lançamentos selecionados"
            : "Editar lançamentos selecionados"
        }
        description={`${batchSummary.count} registros · ${formatCurrency(
          batchSummary.total,
        )} · ${batchSummary.invoices} faturas · ${
          batchSummary.installmentGroups
        } parcelamentos`}
        confirmLabel={
          batchMode === "delete" ? "Excluir selecionados" : "Aplicar alterações"
        }
        danger={batchMode === "delete"}
        critical={batchMode === "delete"}
        onCancel={closeBatchDialog}
        onConfirm={confirmBatch}
      >
        {batchSummary.paid > 0 && (
          <p className="critical-warning">
            Há {batchSummary.paid} registro(s) pago(s) na seleção.
          </p>
        )}

        {batchMode === "edit" && (
          <div className="batch-form">
            <p>Somente os campos preenchidos serão alterados.</p>

            <label>
              Categoria
              <select
                value={batchChanges.category}
                onChange={(event) =>
                  setBatchChanges((value) => ({
                    ...value,
                    category: event.target.value,
                  }))
                }
              >
                <option value="">Não alterar</option>

                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Necessidade
              <select
                value={batchChanges.necessity}
                onChange={(event) =>
                  setBatchChanges((value) => ({
                    ...value,
                    necessity: event.target.value,
                  }))
                }
              >
                <option value="">Não alterar</option>
                <option value="essential">Essencial</option>
                <option value="important">Importante</option>
                <option value="superfluous">Supérfluo</option>
              </select>
            </label>

            <label>
              Status
              <select
                value={batchChanges.status}
                onChange={(event) =>
                  setBatchChanges((value) => ({
                    ...value,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">Não alterar</option>
                <option value="pending">Pendente</option>
                <option value="paid">Pago</option>
              </select>
            </label>

            <label>
              Observação
              <textarea
                value={batchChanges.notes}
                onChange={(event) =>
                  setBatchChanges((value) => ({
                    ...value,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
