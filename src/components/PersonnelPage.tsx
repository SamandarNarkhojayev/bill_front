import React, { useState } from "react";
import { Briefcase, Check, Edit3, Plus, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/useStore";
import { useT } from "../i18n";
import { showConfirm } from "./confirmController";

const PersonnelPage: React.FC = () => {
  const {
    personnel,
    addPersonnelMember,
    updatePersonnelMember,
    removePersonnelMember,
  } = useStore(
    useShallow((s) => ({
      personnel: s.personnel,
      addPersonnelMember: s.addPersonnelMember,
      updatePersonnelMember: s.updatePersonnelMember,
      removePersonnelMember: s.removePersonnelMember,
    })),
  );
  const { t } = useT();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [editName, setEditName] = useState("");
  const [editRoleLabel, setEditRoleLabel] = useState("");

  const handleAdd = () => {
    if (!newName.trim() || !newRoleLabel.trim()) return;
    addPersonnelMember(newName.trim(), newRoleLabel.trim());
    setNewName("");
    setNewRoleLabel("");
    setShowAddForm(false);
  };

  const handleEditStart = (id: string, name: string, roleLabel: string) => {
    setEditingId(id);
    setEditName(name);
    setEditRoleLabel(roleLabel);
  };

  const handleEditSave = (id: string) => {
    if (!editName.trim() || !editRoleLabel.trim()) return;
    updatePersonnelMember(id, {
      name: editName.trim(),
      roleLabel: editRoleLabel.trim(),
    });
    setEditingId(null);
  };

  const handleRemove = async (id: string, name: string) => {
    const ok = await showConfirm({
      title: t("common.delete"),
      message: t("personnel.delete_confirm", { name }),
      confirmText: t("common.delete"),
      danger: true,
    });
    if (ok) removePersonnelMember(id);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Briefcase size={24} className="text-sky-400" />
          <h2 className="page-title">{t("personnel.title")}</h2>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={16} />
            <span>{t("personnel.add")}</span>
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="settings-section" style={{ marginBottom: 20 }}>
          <h3 className="settings-section-title">{t("personnel.add")}</h3>
          <div className="settings-fields">
            <div className="settings-field">
              <label className="settings-label">{t("personnel.name")}</label>
              <input
                className="modal-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("personnel.name_placeholder")}
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">{t("personnel.role")}</label>
              <input
                className="modal-input"
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
                placeholder={t("personnel.role_placeholder")}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setShowAddForm(false)}
              >
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={handleAdd}>
                <Plus size={16} />
                {t("common.add")}
              </button>
            </div>
          </div>
        </div>
      )}

      {personnel.length === 0 ? (
        <div className="settings-section">
          <p className="settings-hint">{t("personnel.empty")}</p>
        </div>
      ) : (
        <div className="users-grid">
          {personnel.map((member) => (
            <div
              key={member.id}
              className={`user-card ${!member.isActive ? "user-disabled" : ""}`}
            >
              <div className="user-card-header">
                <div className="user-card-avatar">
                  <Briefcase size={14} />
                </div>
                <div className="user-card-info">
                  {editingId === member.id ? (
                    <input
                      className="user-edit-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <span className="user-card-name">{member.name}</span>
                  )}
                  {editingId === member.id ? (
                    <input
                      className="user-edit-input"
                      value={editRoleLabel}
                      onChange={(e) => setEditRoleLabel(e.target.value)}
                    />
                  ) : (
                    <span className="user-card-login">{member.roleLabel}</span>
                  )}
                </div>
              </div>

              <div className="user-card-details">
                <div className="user-card-detail">
                  <span className="user-detail-label">
                    {t("personnel.status")}
                  </span>
                  <span
                    className={`user-status ${member.isActive ? "active" : "inactive"}`}
                  >
                    {member.isActive
                      ? t("personnel.active")
                      : t("personnel.inactive")}
                  </span>
                </div>
              </div>

              <div className="user-card-actions">
                {editingId === member.id ? (
                  <>
                    <button
                      className="btn-icon btn-success-icon"
                      onClick={() => handleEditSave(member.id)}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="btn-icon btn-cancel-icon"
                      onClick={() => setEditingId(null)}
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-icon"
                      onClick={() =>
                        handleEditStart(
                          member.id,
                          member.name,
                          member.roleLabel,
                        )
                      }
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() =>
                        updatePersonnelMember(member.id, {
                          isActive: !member.isActive,
                        })
                      }
                      title={
                        member.isActive
                          ? t("personnel.deactivate")
                          : t("personnel.activate")
                      }
                    >
                      {member.isActive ? <X size={16} /> : <Check size={16} />}
                    </button>
                    <button
                      className="btn-icon btn-danger-icon"
                      onClick={() => handleRemove(member.id, member.name)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonnelPage;
