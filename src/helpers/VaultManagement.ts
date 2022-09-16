import { RowDataType, NormalizedPath, TableColumn } from 'cdm/FolderModel';
import { Notice, TFile } from 'obsidian';
import { VaultManagerDB } from 'services/FileManagerService';
import { LOGGER } from "services/Logger";
import NoteInfo from 'services/NoteInfo';
import { DatabaseCore, InputType, SourceDataTypes, UpdateRowOptions } from "helpers/Constants";
import { generateDataviewTableQuery, inlineRegexInFunctionOf } from 'helpers/QueryHelper';
import obtainRowDatabaseFields from 'parsers/FileToRowDatabaseFields';
import { parseFrontmatterFieldsToString } from 'parsers/RowDatabaseFieldsToFile';
import { DataviewService } from 'services/DataviewService';
import { Literal } from 'obsidian-dataview/lib/data-model/value';
import { DataArray } from 'obsidian-dataview/lib/api/data-array';
import { EditionError } from 'errors/ErrorTypes';
import { FilterSettings, LocalSettings } from 'cdm/SettingsModel';
import { NoteInfoPage } from 'cdm/DatabaseModel';
import { inline_regex_target_in_function_of } from './FileManagement';

const noBreakSpace = /\u00A0/g;

/**
 * Check if content has frontmatter
 * @param data 
 * @returns 
 */
export function hasFrontmatter(data: string): boolean {
  if (!data) return false;

  const frontmatterRegex = /^---[\s\S]+?---/g;
  return frontmatterRegex.test(data);
}

/** Check if file is a database note */
export function isDatabaseNote(data: string | TFile) {
  if (data instanceof TFile) {
    if (!data) return false;

    const cache = app.metadataCache.getFileCache(data);

    return !!cache?.frontmatter && !!cache?.frontmatter[DatabaseCore.FRONTMATTER_KEY];
  } else {
    const match = data.match(/---\s+([\w\W]+?)\s+---/);

    if (!match) {
      return false;
    }

    if (!match[1].contains(DatabaseCore.FRONTMATTER_KEY)) {
      return false;
    }

    return true;
  }
}

export function getNormalizedPath(path: string): NormalizedPath {
  const stripped = path.replaceAll("[", "").replaceAll("]", "").replace(noBreakSpace, ' ').normalize('NFC');

  // split on first occurance of '|'
  // "root#subpath##subsubpath|alias with |# chars"
  //             0            ^        1
  const splitOnAlias = stripped.split(/\|(.*)/);

  // split on first occurance of '#' (in substring)
  // "root#subpath##subsubpath"
  //   0  ^        1
  const splitOnHash = splitOnAlias[0].split(/#(.*)/);

  return {
    root: splitOnHash[0],
    subpath: splitOnHash[1] ? '#' + splitOnHash[1] : '',
    alias: splitOnAlias[1] || '',
  };
}

/**
 * With the use of Dataview and the folder path, we can obtain an array of rows
 * @param folderPath 
 * @returns 
 */
export async function adapterTFilesToRows(folderPath: string, columns: TableColumn[], ddbbConfig: LocalSettings, filters: FilterSettings): Promise<Array<RowDataType>> {
  LOGGER.debug(`=> adapterTFilesToRows.  folderPath:${folderPath}`);
  const rows: Array<RowDataType> = [];

  let folderFiles = await sourceDataviewPages(folderPath, ddbbConfig, columns);
  folderFiles = folderFiles.where(p => !p[DatabaseCore.FRONTMATTER_KEY]);
  // Config filters asociated with the database
  if (filters.enabled && filters.conditions.length > 0) {
    folderFiles = folderFiles.where(p => DataviewService.filter(filters.conditions, p, ddbbConfig));
  }
  folderFiles.map((page) => {
    const noteInfo = new NoteInfo(page as NoteInfoPage);
    rows.push(noteInfo.getRowDataType(columns, ddbbConfig));
  });

  LOGGER.debug(`<= adapterTFilesToRows.  number of rows:${rows.length}`);
  return rows;
}

export async function obtainAllPossibleRows(folderPath: string, ddbbConfig: LocalSettings, filters: FilterSettings, columns: TableColumn[]): Promise<Array<RowDataType>> {
  LOGGER.debug(`=> obtainAllPossibleRows.  folderPath:${folderPath}`);
  const rows: Array<RowDataType> = [];
  let folderFiles = await sourceDataviewPages(folderPath, ddbbConfig, columns);
  folderFiles = folderFiles.where(p => !p[DatabaseCore.FRONTMATTER_KEY]);
  // Config filters asociated with the database
  if (filters.enabled && filters.conditions.length > 0) {
    folderFiles = folderFiles.where(p => DataviewService.filter(filters.conditions, p, ddbbConfig));
  }
  folderFiles.map((page) => {
    const noteInfo = new NoteInfo(page as NoteInfoPage);
    rows.push(noteInfo.getAllRowDataType(ddbbConfig));
  });

  LOGGER.debug(`<= obtainAllPossibleRows.  number of rows:${rows.length}`);
  return rows;
}

export async function sourceDataviewPages(folderPath: string, ddbbConfig: LocalSettings, columns: TableColumn[]): Promise<DataArray<Record<string, Literal>>> {
  let pagesResult: DataArray<Record<string, Literal>>;
  switch (ddbbConfig.source_data) {
    case SourceDataTypes.TAG:
      pagesResult = DataviewService.getDataviewAPI().pages(`#${ddbbConfig.source_form_result}`);
      break;
    case SourceDataTypes.INCOMING_LINK:
      pagesResult = DataviewService.getDataviewAPI().pages(`[[${ddbbConfig.source_form_result}]]`);
      break;
    case SourceDataTypes.OUTGOING_LINK:
      pagesResult = DataviewService.getDataviewAPI().pages(`outgoing([[${ddbbConfig.source_form_result}]])`);
      break;
    case SourceDataTypes.QUERY:
      pagesResult = await obtainQueryResult(
        generateDataviewTableQuery(
          columns,
          ddbbConfig.source_form_result),
        folderPath
      );
      break;
    default:
      pagesResult = DataviewService.getDataviewAPI().pages(`"${folderPath}"`);
  }
  return pagesResult;
}

async function obtainQueryResult(query: string, folderPath: string): Promise<DataArray<Record<string, Literal>>> {
  try {
    const result = await DataviewService.getDataviewAPI().query(query);
    if (!result.successful || result.value.type !== 'table') {
      throw new Error(`Query ${query} failed`);
    }
    const arrayRecord: Record<string, Literal>[] = [];
    const headers = result.value.headers;
    result.value.values.forEach((row) => {
      const recordResult: Record<string, Literal> = {};
      headers.forEach((header, index) => {
        recordResult[header] = row[index];
      })
      arrayRecord.push(recordResult);
    });
    return DataviewService.getDataviewAPI().array(arrayRecord);
  } catch (error) {
    const msg = `Error obtaining query result: "${query}", current folder loaded instead`;
    LOGGER.error(msg, error);
    new Notice(msg, 10000);
    return DataviewService.getDataviewAPI().pages(`"${folderPath}"`);
  }
}

export async function updateRowFileProxy(file: TFile, columnId: string, newValue: Literal, columns: TableColumn[], ddbbConfig: LocalSettings, option: string): Promise<void> {
  await updateRowFile(file, columnId, newValue, columns, ddbbConfig, option).catch((err) => {
    throw err;
  });
}

/**
 * Modify the file asociated to the row in function of input options
 * @param asociatedCFilePathToCell 
 * @param columnId 
 * @param newColumnValue 
 * @param option 
 */
export async function updateRowFile(file: TFile, columnId: string, newValue: Literal, columns: TableColumn[], ddbbConfig: LocalSettings, option: string): Promise<void> {
  LOGGER.info(`=>updateRowFile. file: ${file.path} | columnId: ${columnId} | newValue: ${newValue} | option: ${option}`);
  const content = await VaultManagerDB.obtainContentFromTfile(file);
  const contentHasFrontmatter = hasFrontmatter(content);
  const frontmatterKeys = VaultManagerDB.obtainFrontmatterKeys(content);
  const rowFields = obtainRowDatabaseFields(file, columns, frontmatterKeys);
  const column = columns.find(
    c => c.key === (UpdateRowOptions.COLUMN_KEY === option ? newValue : columnId)
  );
  /*******************************************************************************************
   *                              FRONTMATTER GROUP FUNCTIONS
   *******************************************************************************************/
  // Modify value of a column
  async function columnValue(): Promise<void> {
    if (column.config.isInline) {
      await inlineColumnEdit();
      return;
    }
    rowFields.frontmatter[columnId] = DataviewService.parseLiteral(newValue, InputType.MARKDOWN, ddbbConfig);
    await persistFrontmatter();
    await inlineRemoveColumn();
  }

  // Modify key of a column
  async function columnKey(): Promise<void> {
    if (column.config.isInline) {
      // Go to inline mode
      await inlineColumnKey();
      return;
    }
    // If field does not exist yet, ignore it
    if (!Object.prototype.hasOwnProperty.call(rowFields.frontmatter, columnId)
      && !Object.prototype.hasOwnProperty.call(rowFields.inline, columnId)) {
      return;
    }

    // Check if the column is already in the frontmatter
    // assign an empty value to the new key
    rowFields.frontmatter[DataviewService.parseLiteral(newValue, InputType.TEXT, ddbbConfig) as string] = rowFields.frontmatter[columnId] ?? "";
    delete rowFields.frontmatter[columnId];
    await persistFrontmatter(columnId);
  }

  // Remove a column
  async function removeColumn(): Promise<void> {
    if (column.config.isInline) {
      await inlineRemoveColumn();
      return;
    }
    delete rowFields.frontmatter[columnId];
    await persistFrontmatter(columnId);
  }

  async function persistFrontmatter(deletedColumn?: string): Promise<void> {
    console.log('persistFrontmatter');
    const frontmatterGroupRegex = contentHasFrontmatter ? /^---[\s\S]+?---\n/g : /(^[\s\S]*$)/g;
    const frontmatterFieldsText = parseFrontmatterFieldsToString(rowFields, ddbbConfig, deletedColumn);
    const noteObject = {
      action: 'replace',
      file: file,
      regexp: frontmatterGroupRegex,
      newValue: contentHasFrontmatter ? `${frontmatterFieldsText}` : `${frontmatterFieldsText}\n$1`,
    };
    await VaultManagerDB.editNoteContent(noteObject);
  }

  /*******************************************************************************************
   *                              INLINE GROUP FUNCTIONS
   *******************************************************************************************/
  async function inlineColumnEdit(): Promise<void> {
    const inlineFieldRegex = inlineRegexInFunctionOf(columnId);
    if (!inlineFieldRegex.test(content)) {
      await inlineAddColumn();
      return;
    }
    /* Regex explanation
    * group 1 is inline field checking that starts in new line
    * group 2 is the current value of inline field
    */
    const noteObject = {
      action: 'replace',
      file: file,
      regexp: inlineFieldRegex,
      newValue: `$3$6$7$8 ${DataviewService.parseLiteral(newValue, InputType.MARKDOWN, ddbbConfig, true)}$10$11`
    };
    await VaultManagerDB.editNoteContent(noteObject);
    await persistFrontmatter(columnId);
  }

  async function inlineColumnKey(): Promise<void> {
    if (!Object.keys(rowFields.inline).contains(columnId)) {
      return;
    }
    /* Regex explanation
    * group 1 is inline field checking that starts in new line
    * group 2 is the current value of inline field
    */
    const inlineFieldRegex = inlineRegexInFunctionOf(columnId);
    const noteObject = {
      action: 'replace',
      file: file,
      regexp: inlineFieldRegex,
      newValue: `$6$7${newValue}:: $4$9$10$11`
    };
    await VaultManagerDB.editNoteContent(noteObject);
    await persistFrontmatter();
  }

  async function inlineAddColumn(): Promise<void> {
    const inlineAddRegex = contentHasFrontmatter ? new RegExp(`(^---[\\s\\S]+?---\n)+([\\s\\S]*$)`, 'g') : new RegExp(`(^[\\s\\S]*$)`, 'g');
    const noteObject = {
      action: 'replace',
      file: file,
      regexp: inlineAddRegex,
      newValue: inline_regex_target_in_function_of(
        ddbbConfig.inline_new_position,
        columnId,
        DataviewService.parseLiteral(newValue, InputType.MARKDOWN, ddbbConfig).toString(),
        contentHasFrontmatter
      )
    };
    await persistFrontmatter(columnId);
    await VaultManagerDB.editNoteContent(noteObject);
  }

  async function inlineRemoveColumn(): Promise<void> {
    /* Regex explanation
    * group 1 is inline field checking that starts in new line
    * group 2 is the current value of inline field
    */
    const inlineFieldRegex = inlineRegexInFunctionOf(columnId);
    const noteObject = {
      action: 'replace',
      file: file,
      regexp: inlineFieldRegex,
      newValue: `$6$11`
    };
    await VaultManagerDB.editNoteContent(noteObject);
  }
  try {
    // Record of options
    const updateOptions: Record<string, any> = {};
    updateOptions[UpdateRowOptions.COLUMN_VALUE] = columnValue;
    updateOptions[UpdateRowOptions.COLUMN_KEY] = columnKey;
    updateOptions[UpdateRowOptions.REMOVE_COLUMN] = removeColumn;
    updateOptions[UpdateRowOptions.INLINE_VALUE] = inlineColumnEdit;
    // Execute action
    if (updateOptions[option]) {
      // Then execute the action
      await updateOptions[option]();
    } else {
      throw `Error: option ${option} not supported yet`;
    }
  } catch (e) {
    LOGGER.error(`${EditionError.YamlRead}`, e);
    new Notice(`${EditionError.YamlRead} : ${e.message}`, 6000);
  }
  LOGGER.info(`<= updateRowFile.asociatedFilePathToCell: ${file.path} | columnId: ${columnId} | newValue: ${newValue} | option: ${option} `);
}

/**
 * After update a row value, move the file to the new folder path
 * @param folderPath 
 * @param action 
 */
export async function moveFile(folderPath: string, info: {
  file: TFile,
  id: string,
  value: Literal,
  columns: TableColumn[],
  ddbbConfig: LocalSettings
}): Promise<void> {
  await updateRowFile(
    info.file,
    info.id,
    info.value,
    info.columns,
    info.ddbbConfig,
    UpdateRowOptions.COLUMN_VALUE
  );
  try {
    await createFolder(folderPath);
  } catch (error) {
    LOGGER.error(` moveFile Error: ${error.message} `);
    // Handle error
    throw error;
  }
  const filePath = `${folderPath}/${info.file.name}`;
  await app.fileManager.renameFile(info.file, filePath);
}

export async function createFolder(folderPath: string): Promise<void> {
  await app.vault.adapter.exists(folderPath).then(async exists => {
    if (!exists) {
      await app.vault.createFolder(`${folderPath}/`);
    }
  });
}