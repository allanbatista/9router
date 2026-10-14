"use client";

import { createElement as h } from "react";
import PropTypes from "prop-types";
import { ConfirmModal } from "@/shared/components/Modal";

export default function DeleteSessionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  sessionTitle = "esta conversa",
  loading = false,
}) {
  return h(ConfirmModal, {
    isOpen,
    onClose,
    onConfirm,
    title: "Excluir conversa",
    message: `Tem certeza de que deseja excluir "${sessionTitle}"? Esta ação é permanente e não poderá ser desfeita.`,
    confirmText: "Excluir",
    cancelText: "Cancelar",
    variant: "danger",
    loading,
  });
}

DeleteSessionConfirmModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  sessionTitle: PropTypes.string,
  loading: PropTypes.bool,
};
