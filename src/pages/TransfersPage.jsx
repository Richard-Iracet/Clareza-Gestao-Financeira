import { useState } from "react";

import FilterBar from "../components/Filters/FilterBar";
import TransferForm from "../components/Transfers/TransferForm";
import TransferList from "../components/Transfers/TransferList";
import { useFinance } from "../context/FinanceContext";

export default function TransfersPage() {
  const { filteredTransfers, filters } = useFinance();

  const [editingTransfer, setEditingTransfer] = useState(null);

  const editTransfer = (transfer) => {
    setEditingTransfer(transfer);

    document.querySelector(".transfer-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const finishEditing = () => {
    setEditingTransfer(null);
  };

  const showTransfers = filters.transferScope !== "exclude";

  return (
    <div className="page transfers-page">
      <section className="page-section">
        <TransferForm editing={editingTransfer} onFinish={finishEditing} />
      </section>

      <section className="page-section">
        <div className="page-section-header">
          <div className="page-section-heading">
            <p className="eyebrow">Movimentações internas</p>

            <h2>Histórico de transferências</h2>

            <p className="page-section-description">
              Consulte valores movimentados entre suas contas, conclua
              transferências agendadas e registre estornos sem alterar suas
              receitas ou despesas.
            </p>
          </div>

          <div className="page-section-actions">
            <span className="result-count">
              {filteredTransfers.length}{" "}
              {filteredTransfers.length === 1
                ? "transferência"
                : "transferências"}
            </span>
          </div>
        </div>

        <FilterBar />

        {showTransfers ? (
          <TransferList transfers={filteredTransfers} onEdit={editTransfer} />
        ) : (
          <div className="page-empty-state">
            <div className="page-state-content">
              <span className="page-state-icon" aria-hidden="true">
                ⇄
              </span>

              <h3>As transferências estão ocultas pelo filtro.</h3>

              <p>
                Altere a opção “Exibir transferências” para “Incluir” ou
                “Somente transferências” para visualizar o histórico desta
                página.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
