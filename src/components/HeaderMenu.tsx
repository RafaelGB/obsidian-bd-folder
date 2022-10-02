import { InputType, StyleVariables } from "helpers/Constants";
import { dbTrim, c, getLabelHeader } from "helpers/StylesHelper";
import AdjustmentsIcon from "components/img/AdjustmentsIcon";
import React, { FocusEventHandler, useEffect, useState } from "react";
import { usePopper } from "react-popper";
import header_action_button_section from "components/headerActions/HeaderActionButtonSection";
import header_action_types_section from "components/headerActions/HeaderActiontypesSection";
import { ColumnSettingsModal } from "components/modals/columnSettings/ColumnSettingsModal";
import { TableColumn } from "cdm/FolderModel";
import { HeaderActionResponse } from "cdm/HeaderActionModel";
import { HeaderMenuProps } from "cdm/HeaderModel";
import { destination_folder } from "helpers/FileManagement";
import { FileGroupingService } from "services/FileGroupingService";

const HeaderMenu = (headerMenuProps: HeaderMenuProps) => {
  const { table, column } = headerMenuProps.headerProps;
  const { view } = table.options.meta;
  const [columnsInfo, columnActions] = table.options.meta.tableState.columns(
    (state) => [state.info, state.actions]
  );
  const dataActions = table.options.meta.tableState.data(
    (state) => state.actions
  );
  const configInfo = table.options.meta.tableState.configState(
    (state) => state.info
  );
  const configActions =  table.options.meta.tableState.configState((state) => state.actions);
  const ddbbConfig = table.options.meta.tableState.configState( (store) => store.ddbbConfig);

  /** Header props */
  const {
    propertyIcon,
    expanded,
    setExpanded,
    created,
    referenceElement,
    labelState,
    setLabelState,
  } = headerMenuProps;

  const { key, isMetadata, input } = column.columnDef as TableColumn;
  /** Column values */
  const [keyState, setkeyState] = useState(dbTrim(key));
  const [popperElement, setPopperElement] = useState(null);
  const [inputRef, setInputRef] = useState(null);
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom",
    strategy: "absolute",
  });
  // Manage type of data
  const [typeReferenceElement, setTypeReferenceElement] = useState(null);
  const [typePopperElement, setTypePopperElement] = useState(null);
  const [showType, setShowType] = useState(false);

  // Manage errors
  const [labelStateInvalid, setLabelStateInvalid] = useState(false);

  /** Event driven actions */
  useEffect(() => {
    // Throw event if created changed to expand or collapse the menu
    if (created) {
      setExpanded(true);
    }
  }, [created]);

  /**
   * Array of action buttons asociated to the header
   */
  let headerActionResponse: HeaderActionResponse = {
    buttons: [],
    headerMenuProps: headerMenuProps,
    hooks: {
      setExpanded: setExpanded,
      keyState: keyState,
      setKeyState: setkeyState,
      setShowType: setShowType,
    },
  };
  const headerButtons =
    header_action_button_section.run(headerActionResponse).buttons;

  /**
   * Array of type headers available to change the data type of the column
   */
  headerActionResponse.buttons = [];
  const typesButtons =
    header_action_types_section.run(headerActionResponse).buttons;

  const typePopper = usePopper(typeReferenceElement, typePopperElement, {
    placement: "right",
    strategy: "fixed",
  });

  function isValidLabel(newKey: string): boolean {
    if (table.getAllColumns().find((o: any) => o.id === newKey)) {
      return false;
    }

    if (newKey === undefined || newKey === null) {
      return false;
    }

    if (newKey.length === 0) {
      return false;
    }

    return true;
  }

  function persistLabelChange() {
    // trim label will get a valid yaml key
    const newKey = dbTrim(labelState);
    // Check if key already exists. If so, mark it as invalid
    if (!isValidLabel(newKey)) {
      setLabelStateInvalid(true);
      return;
    }
    // Update state of ordered
    const updateOrderWithNewKey = table.options.state.columnOrder.map((o) =>
      o === column.id ? newKey : o
    );
    table.setColumnOrder(updateOrderWithNewKey);

    setkeyState(newKey);

    // Update sorted columns
    if (column.getIsSorted()) {
      const alterSort = table.options.state.sorting.map((o) => {
        if (o.id === column.id) {
          o.id = newKey;
        }
        return o;
      });
      table.setSorting(alterSort);
    }

    // Update state of altered column
    columnActions
      .alterColumnLabel(column.columnDef as TableColumn, labelState)
      .then(() => {
        dataActions.updateDataAfterLabelChange(
          column.columnDef as TableColumn,
          labelState,
          columnsInfo.getAllColumns(),
          configInfo.getLocalSettings()
        );
      });
      // Rename column in group_folder_column
      const groupFolderColumn =
        ddbbConfig.group_folder_column.split(",");
      if (groupFolderColumn.includes(column.columnDef.id)) {
        const newGroupFolderColumn = groupFolderColumn
          .map((item) => item === column.columnDef.id? newKey : item)
          .join(",");
        configActions.alterConfig({ group_folder_column: newGroupFolderColumn });
        // Reorganize files and remove empty folders
        dataActions.groupFiles()
      }
  }

  function handleKeyDown(e: any) {
    if (e.key === "Enter") {
      inputRef.blur();
    }
  }

  function handleChange(e: any) {
    setLabelState(e.target.value);
    if (labelStateInvalid) {
      setLabelStateInvalid(false);
    }
  }

  function handleOnMouseLeaveLabel() {
    if (document.activeElement === inputRef) {
      inputRef.blur();
    }
  }
  /**
   * When user leaves the input field
   * @param e
   */
  const handleBlur: FocusEventHandler<HTMLInputElement> = (e) => {
    e.preventDefault();
    persistLabelChange();
  };

  return (
    <div>
      {expanded && (
        <div className="overlay" onClick={() => setExpanded(false)} />
      )}
      {expanded && (
        <div
          ref={setPopperElement}
          style={{ ...styles.popper, zIndex: 3 }}
          {...attributes.popper}
        >
          <div
            className={`menu ${c("popper")}`}
            style={{
              width: 240,
            }}
          >
            {/** Edit header label section */}
            {!isMetadata && (
              <>
                <div
                  style={{
                    paddingTop: "0.75rem",
                    paddingLeft: "0.75rem",
                    paddingRight: "0.75rem",
                  }}
                >
                  <div className="is-fullwidth" style={{ marginBottom: 12 }}>
                    <input
                      className={
                        labelStateInvalid
                          ? `${c("invalid-form")}`
                          : `${c("form-input")}`
                      }
                      ref={setInputRef}
                      type="text"
                      value={labelState}
                      style={{ width: "100%" }}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onMouseLeave={handleOnMouseLeaveLabel}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <span
                    className="font-weight-600 font-size-75"
                    style={{
                      textTransform: "uppercase",
                      color: StyleVariables.TEXT_FAINT,
                    }}
                  >
                    Property Type
                  </span>
                </div>
                {/** Type of column section */}
                <div style={{ padding: "4px 0px" }}>
                  <div
                    className="menu-item sort-button"
                    onMouseEnter={() => setShowType(true)}
                    onMouseLeave={() => setShowType(false)}
                    ref={setTypeReferenceElement}
                  >
                    <span className="svg-icon svg-text icon-margin">
                      {propertyIcon}
                    </span>
                    <span style={{ textTransform: "capitalize" }}>
                      {getLabelHeader(input)}
                    </span>
                  </div>
                  {showType && (
                    <div
                      className={`menu ${c("popper")}`}
                      ref={setTypePopperElement}
                      onMouseEnter={() => setShowType(true)}
                      onMouseLeave={() => setShowType(false)}
                      {...typePopper.attributes.popper}
                      style={{
                        ...typePopper.styles.popper,
                        width: 200,
                        zIndex: 4,
                        padding: "4px 0px",
                      }}
                    >
                      {/** Childs of typesButtons */}
                      {typesButtons}
                    </div>
                  )}
                </div>
              </>
            )}
            {/** Action buttons section */}
            <div
              style={{
                borderTop: `1px solid ${StyleVariables.BACKGROUND_DIVIDER}`,
                padding: "4px 0px",
              }}
            >
              {headerButtons}
            </div>
            {(!isMetadata || input === InputType.TASK) && (
              <div
                style={{
                  borderTop: `1px solid ${StyleVariables.BACKGROUND_DIVIDER}`,
                  padding: "4px 0px",
                }}
              >
                {/** Column settings section */}

                <div style={{ padding: "4px 0px" }}>
                  <div
                    className="menu-item sort-button"
                    onClick={() => {
                      new ColumnSettingsModal({
                        dataState: { actions: dataActions },
                        columnState: { info: columnsInfo },
                        configState: { info: configInfo },
                        view: table.options.meta.view,
                        headerMenuProps: headerMenuProps,
                      }).open();
                      setExpanded(false);
                    }}
                  >
                    <span className="svg-icon svg-text icon-margin">
                      <AdjustmentsIcon />
                    </span>
                    <span>Settings</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeaderMenu;
