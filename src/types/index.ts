export interface Script {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface Bookmark {
  id: string;
  script_id: string;
  label: string;
  char_offset: number;
}

export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale_factor: number;
  is_primary: boolean;
}
