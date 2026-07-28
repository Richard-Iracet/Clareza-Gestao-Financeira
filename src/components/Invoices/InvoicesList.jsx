import { useEffect, useMemo, useRef, useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import InvoiceCard from "./InvoiceCard";
import PayInvoiceModal from "./PayInvoiceModal";
import CardSettings from "./CardSettings";

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const getMonthKeyFromDate = (value) => {
  if (!validDate(value)) {
    return "";
  }

  return String(value).slice(0, 7);
};

const getCurrentMonthKey = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const formatMonthLabel = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) {
    return "";
  }

  const [year, month] = monthKey.split("-").map(Number);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
};

const capitalize = (value) =>
  value ? `${value.charAt(0).toLocaleUpperCase("pt-BR")}${value.slice(1)}` : "";

const isUnpaidInvoice = (invoice) =>
  invoice.status !== "paid" &&
  Number(invoice.totalPending ?? invoice.total) > 0;

const findInitialMonth = (monthOptions, currentMonthKey) => {
  if (!monthOptions.length) {
    return "";
  }

  const currentMonth = monthOptions.find(
    (option) => option.key === currentMonthKey,
  );

  if (currentMonth) {
    return currentMonth.key;
  }

  const nextMonth = monthOptions.find((option) => option.key > currentMonthKey);

  if (nextMonth) {
    return nextMonth.key;
  }

  return monthOptions[monthOptions.length - 1].key;
};

export default function InvoicesList() {
  const { invoices, payInvoice, updateInvoiceDates } = useFinance();

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [message, setMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const monthListRef = useRef(null);
  const monthButtonRefs = useRef({});

  const currentMonthKey = getCurrentMonthKey();

  const unpaidInvoices = useMemo(
    () =>
      invoices
        .filter(isUnpaidInvoice)
        .filter((invoice) => getMonthKeyFromDate(invoice.dueDate))
        .sort((left, right) =>
          String(left.dueDate).localeCompare(String(right.dueDate)),
        ),
    [invoices],
  );

  const monthOptions = useMemo(() => {
    const monthMap = new Map();

    unpaidInvoices.forEach((invoice) => {
      const monthKey = getMonthKeyFromDate(invoice.dueDate);

      if (!monthKey) {
        return;
      }

      const current = monthMap.get(monthKey) || {
        key: monthKey,
        count: 0,
      };

      monthMap.set(monthKey, {
        ...current,
        count: current.count + 1,
      });
    });

    return [...monthMap.values()].sort((left, right) =>
      left.key.localeCompare(right.key),
    );
  }, [unpaidInvoices]);

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonth("");
      return;
    }

    const selectedStillExists = monthOptions.some(
      (option) => option.key === selectedMonth,
    );

    if (selectedStillExists) {
      return;
    }

    setSelectedMonth(findInitialMonth(monthOptions, currentMonthKey));
  }, [currentMonthKey, monthOptions, selectedMonth]);

  useEffect(() => {
    if (!selectedMonth) {
      return;
    }

    const selectedButton = monthButtonRefs.current[selectedMonth];

    if (!selectedButton) {
      return;
    }

    selectedButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedMonth]);

  const selectedMonthIndex = monthOptions.findIndex(
    (option) => option.key === selectedMonth,
  );

  const visibleInvoices = useMemo(
    () =>
      unpaidInvoices.filter(
        (invoice) => getMonthKeyFromDate(invoice.dueDate) === selectedMonth,
      ),
    [selectedMonth, unpaidInvoices],
  );

  const selectedMonthLabel = capitalize(formatMonthLabel(selectedMonth));

  const selectPreviousMonth = () => {
    if (selectedMonthIndex <= 0) {
      return;
    }

    setSelectedMonth(monthOptions[selectedMonthIndex - 1].key);
  };

  const selectNextMonth = () => {
    if (
      selectedMonthIndex < 0 ||
      selectedMonthIndex >= monthOptions.length - 1
    ) {
      return;
    }

    setSelectedMonth(monthOptions[selectedMonthIndex + 1].key);
  };

  const confirmPayment = (payment) => {
    if (!selectedInvoice) {
      return {
        success: false,
        message: "Nenhuma fatura foi selecionada.",
      };
    }

    const result = payInvoice(selectedInvoice.id, payment);

    if (!result?.success) {
      return result;
    }

    setMessage(`Fatura ${selectedInvoice.cardName} paga com sucesso.`);
    setSelectedInvoice(null);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);

    return result;
  };

  return (
    <section className="invoices-section">
      <div className="section-heading invoices-heading">
        <div>
          <p className="eyebrow">Cartões de crédito</p>
          <h2>Faturas</h2>

          <p className="invoices-section-description">
            Veja e pague as faturas em aberto pelo mês de vencimento.
          </p>
        </div>

        <div className="heading-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => setSettingsOpen(true)}
          >
            Configurar cartões
          </button>

          <span className="result-count">
            {visibleInvoices.length}{" "}
            {visibleInvoices.length === 1 ? "fatura" : "faturas"}
          </span>
        </div>
      </div>

      {monthOptions.length > 0 && (
        <>
          <div
            className="invoice-month-navigation"
            aria-label="Seleção do mês de vencimento das faturas"
          >
            <button
              type="button"
              className="invoice-month-arrow"
              onClick={selectPreviousMonth}
              disabled={selectedMonthIndex <= 0}
              aria-label="Mostrar mês anterior"
            >
              ‹
            </button>

            <div className="invoice-month-list" ref={monthListRef}>
              {monthOptions.map((option) => {
                const active = option.key === selectedMonth;
                const current = option.key === currentMonthKey;

                return (
                  <button
                    type="button"
                    key={option.key}
                    ref={(element) => {
                      if (element) {
                        monthButtonRefs.current[option.key] = element;
                      } else {
                        delete monthButtonRefs.current[option.key];
                      }
                    }}
                    className={`invoice-month-option${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => setSelectedMonth(option.key)}
                  >
                    {current && (
                      <span className="invoice-current-label">Atual</span>
                    )}

                    <strong>{capitalize(formatMonthLabel(option.key))}</strong>

                    <span className="invoice-month-count">{option.count}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="invoice-month-arrow"
              onClick={selectNextMonth}
              disabled={
                selectedMonthIndex < 0 ||
                selectedMonthIndex >= monthOptions.length - 1
              }
              aria-label="Mostrar próximo mês"
            >
              ›
            </button>
          </div>

          <div className="invoice-selected-period">
            <span className="invoice-period-icon" aria-hidden="true">
              ▣
            </span>

            <span>Vencimento selecionado:</span>

            <strong>{selectedMonthLabel}</strong>
          </div>
        </>
      )}

      {message && (
        <div className="success-message" role="status">
          ✓ {message}
        </div>
      )}

      {visibleInvoices.length > 0 ? (
        <div className="invoices-grid">
          {visibleInvoices.map((invoice) => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              onPay={setSelectedInvoice}
              onUpdateDate={updateInvoiceDates}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state invoice-empty-state">
          <span>▣</span>

          <h3>
            {monthOptions.length
              ? "Nenhuma fatura neste mês"
              : "Nenhuma fatura pendente"}
          </h3>

          <p>
            {monthOptions.length
              ? "Não existem faturas não pagas com vencimento no período selecionado."
              : "Todas as suas faturas estão pagas ou ainda não existem faturas cadastradas."}
          </p>
        </div>
      )}

      {monthOptions.length > 0 && (
        <div className="invoice-list-notice">
          <span aria-hidden="true">i</span>

          <div>
            <strong>Mostrando somente faturas não pagas.</strong>

            <p>
              Faturas pagas não aparecem nesta lista. Os meses são organizados
              pela data de vencimento.
            </p>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <PayInvoiceModal
          invoice={selectedInvoice}
          onConfirm={confirmPayment}
          onClose={() => setSelectedInvoice(null)}
        />
      )}

      {settingsOpen && <CardSettings onClose={() => setSettingsOpen(false)} />}
    </section>
  );
}
